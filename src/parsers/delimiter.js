// Delimiter parser — splits incoming data on a delimiter byte or byte sequence.
// Emits complete messages (without the delimiter) via EventEmitter 'data' event.

import { EventEmitter } from 'node:events'

export function delimiterParser(options = {}) {
  const { delimiter = 0x0a, includeDelimiter = false } = options

  // Normalize delimiter to Uint8Array
  const delim = typeof delimiter === 'number'
    ? new Uint8Array([delimiter])
    : typeof delimiter === 'string'
      ? new TextEncoder().encode(delimiter)
      : new Uint8Array(delimiter)

  const emitter = new EventEmitter()
  let buf = new Uint8Array(256)
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

    // Scan for delimiter
    let start = 0
    while (start <= len - delim.length) {
      const idx = findDelimiter(buf, delim, start, len)
      if (idx === -1) break

      const end = includeDelimiter ? idx + delim.length : idx
      if (end > start) {
        emitter.emit('data', buf.slice(start, end))
      }
      start = idx + delim.length
    }

    // Compact remainder
    if (start > 0) {
      const remaining = len - start
      if (remaining > 0) buf.copyWithin(0, start, len)
      len = remaining
    }
  }

  emitter.push = push
  return emitter
}

function findDelimiter(haystack, needle, start, haystackLen) {
  if (needle.length === 1) {
    const byte = needle[0]
    for (let i = start; i < haystackLen; i++) {
      if (haystack[i] === byte) return i
    }
    return -1
  }
  const limit = haystackLen - needle.length
  outer: for (let i = start; i <= limit; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}
