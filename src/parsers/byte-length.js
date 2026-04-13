// Byte-length parser — emits chunks of exactly N bytes.

import { EventEmitter } from 'node:events'

export function byteLengthParser(options = {}) {
  const { length = 1 } = options
  if (length < 1) throw new Error('length must be >= 1')

  const emitter = new EventEmitter()
  let buf = new Uint8Array(Math.max(length * 2, 256))
  let len = 0

  function ensureCapacity(needed) {
    if (needed <= buf.length) return
    let cap = buf.length
    while (cap < needed) cap *= 2
    const next = new Uint8Array(cap)
    next.set(buf.subarray(0, len))
    buf = next
  }

  function push(chunk) {
    ensureCapacity(len + chunk.length)
    buf.set(chunk, len)
    len += chunk.length

    while (len >= length) {
      emitter.emit('data', buf.slice(0, length))
      const remaining = len - length
      if (remaining > 0) buf.copyWithin(0, length, len)
      len = remaining
    }
  }

  emitter.push = push
  return emitter
}
