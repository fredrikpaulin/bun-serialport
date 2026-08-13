// Integration tests against a real pty. Linux-only in CI terms — the pty
// helper works on macOS too, but these are gated to where they're verified.

import { test, expect } from 'bun:test'
import { platform } from 'node:os'
import { SerialPort } from '../src/serialport.js'
import { openPty } from './helpers/pty.js'

const isLinux = platform() === 'linux'
const itLinux = isLinux ? test : test.skip

itLinux('open, write, close delivers all bytes', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 115200, autoOpen: false })
  await port.open()
  await port.write('foo bar\n')
  await port.close()
  const received = await pty.collect(8)
  expect(new TextDecoder().decode(received)).toBe('foo bar\n')
  pty.closeMaster()
})

itLinux('data events fire for incoming bytes', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 115200, autoOpen: false })
  await port.open()
  const got = new Promise(resolve => port.once('data', resolve))
  pty.writeMaster(new TextEncoder().encode('pong\n'))
  const chunk = await got
  expect(new TextDecoder().decode(chunk)).toBe('pong\n')
  await port.close()
  pty.closeMaster()
})

itLinux('concurrent writes do not interleave', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 115200, autoOpen: false })
  await port.open()

  // Two patterned buffers big enough to force multiple partial writes while
  // the master drains slowly.
  const a = new Uint8Array(32768).fill(0x41) // 'A'
  const b = new Uint8Array(32768).fill(0x42) // 'B'
  const writes = Promise.all([port.write(a), port.write(b)])
  const received = await pty.collect(a.length + b.length, 10000)
  await writes
  await port.close()
  pty.closeMaster()

  expect(received.length).toBe(a.length + b.length)
  // All A bytes must precede all B bytes
  const firstB = received.indexOf(0x42)
  const lastA = received.lastIndexOf(0x41)
  expect(firstB).toBe(a.length)
  expect(lastA).toBe(a.length - 1)
})

itLinux('close() interrupts a write stuck on a full kernel buffer', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 115200, autoOpen: false })
  await port.open()

  // Nobody reads the master, so the pty buffer fills and the write parks
  // in its EAGAIN retry loop.
  const big = new Uint8Array(1 << 20)
  const pending = port.write(big)
  await Bun.sleep(50) // let it hit the wall

  await port.close() // must resolve, not hang, and never write(2) after close
  await expect(pending).rejects.toThrow('write aborted')
  expect(port.isOpen).toBe(false)
  pty.closeMaster()
})

itLinux('write after close rejects cleanly', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 115200, autoOpen: false })
  await port.open()
  await port.close()
  await expect(port.write('late')).rejects.toThrow('Port is not open')
  pty.closeMaster()
})

itLinux('drain waits for queued writes to reach the kernel', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 115200, autoOpen: false })
  await port.open()

  const payload = new Uint8Array(16384).fill(0x58)
  const reader = pty.collect(payload.length, 10000) // drain master concurrently
  port.write(payload) // intentionally not awaited
  await port.drain()  // must not resolve while bytes sit in the JS retry loop
  const received = await reader
  expect(received.length).toBe(payload.length)
  await port.close()
  pty.closeMaster()
})

itLinux('port survives child-process signal churn', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 115200, autoOpen: false })
  await port.open()
  let sawError = null
  port.on('error', (e) => { sawError = e })

  // SIGCHLD storm while the read loop polls
  for (let i = 0; i < 30; i++) {
    Bun.spawn(['true'])
    await Bun.sleep(5)
  }
  await Bun.sleep(100)

  expect(sawError).toBe(null)
  expect(port.isOpen).toBe(true)
  await port.close()
  pty.closeMaster()
})

itLinux('second open of a locked port fails fast', async () => {
  const pty = openPty()
  const a = new SerialPort({ path: pty.slavePath, baudRate: 9600, autoOpen: false })
  const b = new SerialPort({ path: pty.slavePath, baudRate: 9600, autoOpen: false })
  await a.open()
  await expect(b.open()).rejects.toThrow('Cannot lock')
  await a.close()
  // lock dies with the fd — reopening now works
  await b.open()
  await b.close()
  pty.closeMaster()
})

itLinux('lock: false allows shared open', async () => {
  const pty = openPty()
  const a = new SerialPort({ path: pty.slavePath, baudRate: 9600, lock: false, autoOpen: false })
  const b = new SerialPort({ path: pty.slavePath, baudRate: 9600, lock: false, autoOpen: false })
  await a.open()
  await b.open()
  await a.close()
  await b.close()
  pty.closeMaster()
})

itLinux('spawned children do not inherit the port fd', async () => {
  const { readdir, readlink } = await import('node:fs/promises')
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 9600, autoOpen: false })
  await port.open()

  const child = Bun.spawn(['sleep', '2'])
  await Bun.sleep(100)
  const fds = await readdir(`/proc/${child.pid}/fd`)
  const targets = await Promise.all(
    fds.map(fd => readlink(`/proc/${child.pid}/fd/${fd}`).catch(() => ''))
  )
  child.kill()
  await port.close()
  pty.closeMaster()

  expect(targets).not.toContain(pty.slavePath)
})

itLinux('iflag carries IGNPAR, INPCK with parity, and IXANY when asked', async () => {
  const { readIflag } = await import('./helpers/pty.js')
  const IGNPAR = 4, INPCK = 0x10, IXANY = 0x800
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 9600, parity: 'even', xany: true, autoOpen: false })
  await port.open()
  const iflag = readIflag(pty.slavePath)
  expect(iflag & IGNPAR).toBe(IGNPAR)
  expect(iflag & INPCK).toBe(INPCK)
  expect(iflag & IXANY).toBe(IXANY)
  await port.close()
  pty.closeMaster()
})

itLinux('disconnect close event carries the originating error', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 9600, autoOpen: false })
  await port.open()
  port.on('error', () => {}) // keep the 'error' emit from throwing
  const closeArg = new Promise(resolve => port.once('close', (cause) => resolve(cause)))
  pty.closeMaster() // device vanishes
  const cause = await closeArg
  expect(cause).toBeDefined()
  expect(cause.disconnected).toBe(true)
})

itLinux('deliberate close event carries no argument', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 9600, autoOpen: false })
  await port.open()
  const closeArg = new Promise(resolve => port.once('close', (...args) => resolve(args)))
  await port.close()
  expect(await closeArg).toEqual([])
  pty.closeMaster()
})

itLinux('custom baud rate opens via termios2 and still moves bytes', async () => {
  const pty = openPty()
  const port = new SerialPort({ path: pty.slavePath, baudRate: 250000, autoOpen: false })
  await port.open()
  expect(port.baudRate).toBe(250000)
  await port.write('dmx\n')
  const received = await pty.collect(4)
  expect(new TextDecoder().decode(received)).toBe('dmx\n')
  await port.update({ baudRate: 74880 }) // custom → custom
  await port.update({ baudRate: 9600 })  // custom → standard
  await port.write('ok')
  await pty.collect(2)
  await port.close()
  pty.closeMaster()
})
