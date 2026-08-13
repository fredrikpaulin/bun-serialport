// Typed consumer fixture. Type-checks the declared surface through the
// package's real exports map (nodenext self-reference), so what passes here
// is what an npm consumer gets. Never executed — `bun x tsc --noEmit` only.

import { SerialPort, list, readlineParser, type PortInfo, type DisconnectError } from 'bun-serialport'
import { delimiterParser, byteLengthParser, type ByteParser } from 'bun-serialport/parsers'

async function exercise(): Promise<void> {
  // Constructor with every option
  const port = new SerialPort({
    path: '/dev/ttyUSB0',
    baudRate: 250000,
    dataBits: 8,
    stopBits: 1,
    parity: 'even',
    rtscts: false,
    xon: false,
    xoff: false,
    xany: true,
    hupcl: false,
    lock: true,
    autoOpen: false,
    readBufferSize: 4096,
    readInterval: 2,
  })

  // Readonly properties
  const p: string = port.path
  const rate: number = port.baudRate
  const open: boolean = port.isOpen
  void p; void rate; void open

  // Events with their payload types
  port.on('data', (data: Uint8Array) => void data.byteLength)
  port.on('error', (err: DisconnectError) => void err.disconnected)
  port.on('close', (err?: DisconnectError) => void err?.message)
  port.once('open', () => {})

  // Methods with exact signatures
  await port.open()
  const written: number = await port.write('hello\n')
  void written
  await port.write(new Uint8Array([1, 2, 3]))
  await port.write(new ArrayBuffer(8))
  await port.write([0x0d, 0x0a])
  await port.update({ baudRate: 115200 })
  await port.set({ dtr: true, rts: false, brk: false })
  const status = await port.get()
  const cts: boolean = status.cts
  void cts
  await port.flush()
  await port.drain()

  // Parsers: pipe() preserves the concrete parser type
  const lines = port.pipe(readlineParser({ delimiter: '\r\n', encoding: 'utf-8' }))
  lines.on('data', (line: string) => void line.length)

  const frames: ByteParser = port.pipe(byteLengthParser({ length: 8 }))
  frames.on('data', (frame: Uint8Array) => void frame.length)
  port.unpipe(frames)

  const packets = delimiterParser({ delimiter: [0x7e], includeDelimiter: true })
  packets.push(new Uint8Array([0x01, 0x7e]))

  await port.close()

  // list() metadata fields
  const ports: PortInfo[] = await list()
  for (const info of ports) {
    const id: string | undefined = info.pnpId
    const loc: string | undefined = info.locationId
    void id; void loc
  }

  // --- Negative cases: these MUST fail to compile ---

  // @ts-expect-error 'mark' parity is not supported
  new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600, parity: 'mark' })

  // @ts-expect-error baudRate is required
  new SerialPort({ path: '/dev/ttyUSB0' })

  // @ts-expect-error data events carry Uint8Array, not string
  port.on('data', (line: string) => void line)

  // @ts-expect-error unknown set() flag
  await port.set({ dsr: true })

  // @ts-expect-error hupcl is a boolean
  new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600, hupcl: 'yes' })

  // @ts-expect-error readline parser emits strings
  lines.on('data', (buf: Uint8Array) => void buf)
}

void exercise
