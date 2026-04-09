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
  let buffer = new Uint8Array(0)

  function push(chunk) {
    // Append chunk to buffer
    const next = new Uint8Array(buffer.length + chunk.length)
    next.set(buffer)
    next.set(chunk, buffer.length)
    buffer = next

    // Scan for delimiter
    let start = 0
    while (start <= buffer.length - delim.length) {
      const idx = findDelimiter(buffer, delim, start)
      if (idx === -1) break

      const end = includeDelimiter ? idx + delim.length : idx
      if (end > start) {
        emitter.emit('data', buffer.slice(start, end))
      }
      start = idx + delim.length
    }

    // Keep remainder
    if (start > 0) {
      buffer = buffer.slice(start)
    }
  }

  emitter.push = push
  return emitter
}

function findDelimiter(haystack, needle, start) {
  if (needle.length === 1) {
    return haystack.indexOf(needle[0], start)
  }
  outer: for (let i = start; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return i
  }
  return -1
}
