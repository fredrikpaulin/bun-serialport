// SerialPort — EventEmitter-based serial port for Bun.
// Opens a serial device via POSIX termios FFI, reads in a non-blocking loop,
// and emits data as Uint8Array chunks.

import { EventEmitter } from 'node:events'
import {
  openPort, closePort, writePort, readPort,
  updateBaudRate, setModemLines, getModemLines,
  flushPort, drainPort, validateOpenOptions
} from './bindings/posix.js'

const DEFAULT_READ_BUFFER_SIZE = 65536
const DEFAULT_READ_INTERVAL_MS = 1

export class SerialPort extends EventEmitter {
  #fd = -1
  #path
  #baudRate
  #options
  #isOpen = false
  #isClosing = false
  #readBuf
  #readInterval
  #readTimer = null
  #openingPromise = null

  constructor(options) {
    super()
    if (!options || !options.path) throw new Error('options.path is required')
    if (options.baudRate === undefined) throw new Error('options.baudRate is required')
    validateOpenOptions(options)

    this.#path = options.path
    this.#baudRate = options.baudRate
    this.#options = { ...options }
    this.#readBuf = new Uint8Array(options.readBufferSize ?? DEFAULT_READ_BUFFER_SIZE)
    this.#readInterval = options.readInterval ?? DEFAULT_READ_INTERVAL_MS

    if (options.autoOpen !== false) {
      // Defer to next tick so caller can attach event listeners
      this.#openingPromise = Promise.resolve()
        .then(() => this.#performOpen())
        .finally(() => { this.#openingPromise = null })
      this.#openingPromise.catch(err => this.emit('error', err))
    }
  }

  get path() { return this.#path }
  get baudRate() { return this.#baudRate }
  get isOpen() { return this.#isOpen && !this.#isClosing }

  async open() {
    if (this.#isOpen) throw new Error('Port is already open')
    if (this.#openingPromise) return this.#openingPromise

    this.#openingPromise = this.#performOpen()
      .finally(() => { this.#openingPromise = null })
    return this.#openingPromise
  }

  async #performOpen() {
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
    if (this.#openingPromise) await this.#openingPromise
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
    await this.#ensureOpen()
    return await writePort(this.#fd, data)
  }

  async update(options) {
    await this.#ensureOpen()

    if (options.baudRate !== undefined) {
      updateBaudRate(this.#fd, options.baudRate)
      this.#baudRate = options.baudRate
      this.#options = { ...this.#options, baudRate: options.baudRate }
    }
  }

  async set(flags) {
    await this.#ensureOpen()
    setModemLines(this.#fd, flags)
  }

  async get() {
    await this.#ensureOpen()
    return getModemLines(this.#fd)
  }

  async flush() {
    await this.#ensureOpen()
    flushPort(this.#fd)
  }

  async drain() {
    await this.#ensureOpen()
    drainPort(this.#fd)
  }

  // Wire a parser to receive data events
  pipe(parser) {
    const handler = (chunk) => parser.push(chunk)
    this.on('data', handler)
    parser._unpipe = () => this.off('data', handler)
    return parser
  }

  // Detach a previously piped parser
  unpipe(parser) {
    if (parser && typeof parser._unpipe === 'function') {
      parser._unpipe()
      parser._unpipe = undefined
    }
  }

  // --- Private ---

  async #ensureOpen() {
    if (this.#openingPromise) await this.#openingPromise
    if (!this.#isOpen || this.#isClosing) {
      throw new Error('Port is not open')
    }
  }

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
          const data = this.#readBuf.slice(0, n)
          this.emit('data', data)
        }
      } catch (err) {
        err.disconnected = true
        this.emit('error', err)
        this.close().catch(() => {})
      }
    }, this.#readInterval)
  }

  #stopReading() {
    if (this.#readTimer !== null) {
      clearInterval(this.#readTimer)
      this.#readTimer = null
    }
  }
}
