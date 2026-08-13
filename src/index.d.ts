// Type declarations for bun-serialport. Hand-authored — the source is
// JavaScript and stays that way; this file is the typed mirror of the API
// and is reviewed like public API, because it is.
//
// Deliberately standalone: no @types/node, no bun-types. The event-emitter
// surface is declared inline so type-checking a consumer needs zero type
// dependencies. Structural typing keeps this compatible with code that
// expects an EventEmitter shape.

export interface SerialPortOptions {
  /** Device path, e.g. '/dev/ttyUSB0' or '/dev/cu.usbserial-A50285BI'. */
  path: string
  /**
   * Any positive integer. Standard rates use the classic POSIX table;
   * others go through termios2/BOTHER (Linux) or IOSSIOSPEED (macOS).
   */
  baudRate: number
  /** Data bits (default: 8). */
  dataBits?: 5 | 6 | 7 | 8
  /** Stop bits (default: 1). */
  stopBits?: 1 | 2
  /** Parity (default: 'none'). Bytes failing the parity check are dropped. */
  parity?: 'none' | 'even' | 'odd'
  /** Hardware flow control (default: false). */
  rtscts?: boolean
  /** Software flow control, outbound (default: false). */
  xon?: boolean
  /** Software flow control, inbound (default: false). */
  xoff?: boolean
  /** Any received character restarts XOFF-stopped output (default: false). */
  xany?: boolean
  /** Drop DTR/RTS on close (default: true). Set false for boards that reset on a DTR edge. */
  hupcl?: boolean
  /** Exclusive access via flock (default: true). */
  lock?: boolean
  /** Open on construction (default: true). */
  autoOpen?: boolean
  /** Read buffer size in bytes (default: 65536). */
  readBufferSize?: number
  /** Read poll interval in ms (default: 1). */
  readInterval?: number
}

/** Accepted by write(). Strings are UTF-8 encoded. */
export type WriteData = string | Uint8Array | ArrayBuffer | number[]

export interface SetFlags {
  dtr?: boolean
  rts?: boolean
  /** Assert (true) or clear (false) the break signal. */
  brk?: boolean
}

export interface ModemStatus {
  cts: boolean
  dsr: boolean
  dcd: boolean
  ri: boolean
}

/** Errors from an unexpected device disconnect carry disconnected: true. */
export type DisconnectError = Error & { disconnected?: boolean }

export interface PortInfo {
  path: string
  manufacturer?: string
  serialNumber?: string
  /** /dev/serial/by-id name — stable across replugs (Linux). */
  pnpId?: string
  /** sysfs USB devpath, e.g. '1-1.4' — stable per physical port (Linux). */
  locationId?: string
  vendorId?: string
  productId?: string
  product?: string
}

/**
 * Minimal parser shape accepted by pipe()/unpipe() — anything with a
 * push(Uint8Array) method qualifies, which is all the runtime relies on.
 */
export interface Parser {
  push(chunk: Uint8Array): void
}

export declare class SerialPort {
  constructor(options: SerialPortOptions)

  readonly path: string
  readonly baudRate: number
  /** true when open and not closing. */
  readonly isOpen: boolean

  /** Open the port (only needed with autoOpen: false). */
  open(): Promise<void>
  /** Wait for in-flight writes, drain pending output, then close. */
  close(): Promise<void>
  /** Resolves with the byte count once the kernel has accepted all bytes. */
  write(data: WriteData): Promise<number>
  update(options: { baudRate: number }): Promise<void>
  /** Set modem control lines and the break signal. Unknown flags throw. */
  set(flags: SetFlags): Promise<void>
  get(): Promise<ModemStatus>
  /** Discard buffered I/O data. */
  flush(): Promise<void>
  /** Wait until queued writes reach the kernel and the kernel transmits them. */
  drain(): Promise<void>
  /** Wire a parser to receive data events; returns the parser. */
  pipe<T extends Parser>(parser: T): T
  unpipe(parser: Parser): void

  on(event: 'data', listener: (data: Uint8Array) => void): this
  on(event: 'error', listener: (err: DisconnectError) => void): this
  /** A disconnect-caused close receives the originating error; a deliberate close() emits nothing. */
  on(event: 'close', listener: (err?: DisconnectError) => void): this
  on(event: 'open', listener: () => void): this

  once(event: 'data', listener: (data: Uint8Array) => void): this
  once(event: 'error', listener: (err: DisconnectError) => void): this
  once(event: 'close', listener: (err?: DisconnectError) => void): this
  once(event: 'open', listener: () => void): this

  off(event: 'data', listener: (data: Uint8Array) => void): this
  off(event: 'error', listener: (err: DisconnectError) => void): this
  off(event: 'close', listener: (err?: DisconnectError) => void): this
  off(event: 'open', listener: () => void): this

  addListener(event: 'data' | 'error' | 'close' | 'open', listener: (...args: never[]) => void): this
  removeListener(event: 'data' | 'error' | 'close' | 'open', listener: (...args: never[]) => void): this
  removeAllListeners(event?: 'data' | 'error' | 'close' | 'open'): this
  listenerCount(event: 'data' | 'error' | 'close' | 'open'): number
  emit(event: string, ...args: unknown[]): boolean
}

/** Enumerate available serial ports. */
export declare function list(): Promise<PortInfo[]>

export {
  delimiterParser,
  byteLengthParser,
  readlineParser,
  type ByteParser,
  type LineParser,
  type DelimiterParserOptions,
  type ByteLengthParserOptions,
  type ReadlineParserOptions,
} from './parsers/index.js'
