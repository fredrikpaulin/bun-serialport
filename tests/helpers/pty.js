// Test helper: create a pseudo-terminal pair via libc, no dependencies.
// The slave end behaves like a serial device for SerialPort; the master end
// is the "far side" the tests read from and write to.

import { dlopen, FFIType, ptr, CString } from 'bun:ffi'
import { platform } from 'node:os'

const IS_LINUX = platform() === 'linux'
const LIBC_PATH = IS_LINUX ? 'libc.so.6' : 'libSystem.B.dylib'

const libc = dlopen(LIBC_PATH, {
  posix_openpt: { args: [FFIType.i32], returns: FFIType.i32 },
  open: { args: [FFIType.cstring, FFIType.i32], returns: FFIType.i32 },
  tcgetattr: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
  grantpt: { args: [FFIType.i32], returns: FFIType.i32 },
  unlockpt: { args: [FFIType.i32], returns: FFIType.i32 },
  ptsname: { args: [FFIType.i32], returns: FFIType.ptr },
  read: { args: [FFIType.i32, FFIType.ptr, FFIType.u64], returns: FFIType.i64 },
  write: { args: [FFIType.i32, FFIType.ptr, FFIType.u64], returns: FFIType.i64 },
  close: { args: [FFIType.i32], returns: FFIType.i32 },
})

const O_RDWR = 2
const O_NOCTTY = IS_LINUX ? 256 : 0x20000
const O_NONBLOCK = IS_LINUX ? 2048 : 4

// Read c_iflag for a tty path — termios state is per-device, so a second fd
// sees the flags SerialPort applied.
export function readIflag(path) {
  const pathBuf = new TextEncoder().encode(path + '\0')
  const fd = libc.symbols.open(ptr(pathBuf), O_RDWR | O_NOCTTY | O_NONBLOCK)
  if (fd < 0) throw new Error('open for readback failed')
  const buf = new Uint8Array(128)
  if (libc.symbols.tcgetattr(fd, ptr(buf)) < 0) {
    libc.symbols.close(fd)
    throw new Error('tcgetattr failed')
  }
  libc.symbols.close(fd)
  const view = new DataView(buf.buffer)
  // c_iflag is the first field; 4 bytes on Linux, 8 on macOS
  return IS_LINUX ? view.getUint32(0, true) : Number(view.getBigUint64(0, true))
}

// Returns { masterFd, slavePath, readMaster, closeMaster }
export function openPty() {
  const masterFd = libc.symbols.posix_openpt(O_RDWR | O_NOCTTY | O_NONBLOCK)
  if (masterFd < 0) throw new Error('posix_openpt failed')
  if (libc.symbols.grantpt(masterFd) < 0) throw new Error('grantpt failed')
  if (libc.symbols.unlockpt(masterFd) < 0) throw new Error('unlockpt failed')
  const namePtr = libc.symbols.ptsname(masterFd)
  if (!namePtr) throw new Error('ptsname failed')
  const slavePath = new CString(namePtr).toString()

  const buf = new Uint8Array(65536)

  // Non-blocking read of whatever is currently buffered on the master
  function readMaster() {
    const n = Number(libc.symbols.read(masterFd, ptr(buf), BigInt(buf.length)))
    if (n <= 0) return new Uint8Array(0)
    return buf.slice(0, n)
  }

  // Drain the master until `total` bytes arrive or timeout
  async function collect(total, timeoutMs = 5000) {
    const chunks = []
    let got = 0
    const deadline = Date.now() + timeoutMs
    while (got < total && Date.now() < deadline) {
      const chunk = readMaster()
      if (chunk.length > 0) {
        chunks.push(chunk)
        got += chunk.length
      } else {
        await Bun.sleep(2)
      }
    }
    const out = new Uint8Array(got)
    let off = 0
    for (const c of chunks) { out.set(c, off); off += c.length }
    return out
  }

  function writeMaster(bytes) {
    return Number(libc.symbols.write(masterFd, ptr(bytes), BigInt(bytes.length)))
  }

  function closeMaster() {
    libc.symbols.close(masterFd)
  }

  return { masterFd, slavePath, readMaster, collect, writeMaster, closeMaster }
}
