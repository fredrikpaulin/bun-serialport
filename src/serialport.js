// SerialPort — EventEmitter-based serial port for Bun.
// Opens a serial device via POSIX termios FFI, reads in a non-blocking loop,
// and emits data as Uint8Array chunks.

import { EventEmitter } from 'node:events'
import {
  openPort, closePort, writePort, readPort,
  updateBaudRate, setModemLines, getModemLines,
  flushPort, drainPort
} from './bindings/posix.js'

const DEFAULT_READ_BUFFER_SIZE = 65536
const READ_INTERVAL_MS = 1

export class SerialPort extends EventEmitter {
  #fd = -1
  #path
  #baudRate
  #options
  #isOpen = false
  #isClosing = false
  #readBuf
  #readTimer = null

  constructor(options) {
    super()
    if (!options || !options.path) throw new Error('options.path is required')
    if (!options.baudRate) throw new Error('options.baudRate is required')

    this.#path = options.path
    this.#baudRate = options.baudRate
    this.#options = { ...options }
    this.#readBuf = new Uint8Array(options.readBufferSize || DEFAULT_READ_BUFFER_SIZE)

    if (options.autoOpen !== false) {
      // Defer to next tick so caller can attach event listeners
      queueMicrotask(() => this.open().catch(err => this.emit('error', err)))
    }
  }

  get path() { return this.#path }
  get baudRate() { return this.#baudRate }
  get isOpen() { return this.#isOpen && !this.#isClosing }

  async open() {
    if (this.#isOpen) throw new Error('Port is already open')

    try {
      this.#fd = openPort(this.#path, this.#options)
      this.#isOpen = true
      this.#isClosing = false
      this.#startReading()
      this.emit('open')
    } catch (err) {
      this.#isOpen = false
      throw err
    }
  }

  async close() {
    if (!this.#isOpen) throw new Error('Port is not open')
    if (this.#isClosing) return

    this.#isClosing = true
    this.#stopReading()

    try {
      closePort(this.#fd)
    } catch (err) {
      this.#isClosing = false
      throw err
    }

    this.#fd = -1
    this.#isOpen = false
    this.#isClosing = false
    this.emit('close')
  }

  async write(data) {
    if (!this.#isOpen || this.#isClosing) {
      throw new Error('Port is not open')
    }

    const buf = typeof data === 'string'
      ? Buffer.from(data, 'utf-8')
      : data

    return writePort(this.#fd, buf)
  }

  async update(options) {
    if (!this.#isOpen) throw new Error('Port is not open')

    if (options.baudRate !== undefined) {
      updateBaudRate(this.#fd, options.baudRate)
      this.#baudRate = options.baudRate
    }
  }

  async set(flags) {
    if (!this.#isOpen) throw new Error('Port is not open')
    setModemLines(this.#fd, flags)
  }

  async get() {
    if (!this.#isOpen) throw new Error('Port is not open')
    return getModemLines(this.#fd)
  }

  async flush() {
    if (!this.#isOpen) throw new Error('Port is not open')
    flushPort(this.#fd)
  }

  async drain() {
    if (!this.#isOpen) throw new Error('Port is not open')
    drainPort(this.#fd)
  }

  // Wire a parser to receive data events
  pipe(parser) {
    this.on('data', (chunk) => parser.push(chunk))
    return parser
  }

  // --- Private ---

  #startReading() {
    // Non-blocking read loop using setInterval.
    // Bun doesn't currently expose epoll/kqueue for arbitrary fds,
    // so we poll with a tight interval. 1ms is a good balance for
    // robotics — low latency without busy-spinning.
    this.#readTimer = setInterval(() => {
      if (!this.#isOpen || this.#isClosing) return

      try {
        const n = readPort(this.#fd, this.#readBuf)
        if (n > 0) {
          // Emit a copy so the read buffer can be reused
          const data = new Uint8Array(this.#readBuf.buffer, 0, n).slice()
          this.emit('data', data)
        }
      } catch (err) {
        err.disconnected = true
        this.emit('error', err)
        this.close().catch(() => {})
      }
    }, READ_INTERVAL_MS)
  }

  #stopReading() {
    if (this.#readTimer !== null) {
      clearInterval(this.#readTimer)
      this.#readTimer = null
    }
  }
}
