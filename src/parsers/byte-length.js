// Byte-length parser — emits chunks of exactly N bytes.

import { EventEmitter } from 'node:events'

export function byteLengthParser(options = {}) {
  const { length = 1 } = options
  if (length < 1) throw new Error('length must be >= 1')

  const emitter = new EventEmitter()
  let buffer = new Uint8Array(0)

  function push(chunk) {
    const next = new Uint8Array(buffer.length + chunk.length)
    next.set(buffer)
    next.set(chunk, buffer.length)
    buffer = next

    while (buffer.length >= length) {
      emitter.emit('data', buffer.slice(0, length))
      buffer = buffer.slice(length)
    }
  }

  emitter.push = push
  return emitter
}
