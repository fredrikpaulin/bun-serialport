// Readline parser — convenience wrapper around delimiter parser.
// Splits on newline, returns strings.

import { delimiterParser } from './delimiter.js'

export function readlineParser(options = {}) {
  const { delimiter = '\n', encoding = 'utf-8' } = options
  const inner = delimiterParser({ delimiter })
  const decoder = new TextDecoder(encoding)

  // Wrap the inner emitter to decode data to string
  const origOn = inner.on.bind(inner)
  const listeners = new Map()

  inner.on = function (event, fn) {
    if (event === 'data') {
      const wrapped = (buf) => fn(decoder.decode(buf))
      listeners.set(fn, wrapped)
      return origOn('data', wrapped)
    }
    return origOn(event, fn)
  }

  const origOff = inner.off.bind(inner)
  inner.off = function (event, fn) {
    if (event === 'data' && listeners.has(fn)) {
      const wrapped = listeners.get(fn)
      listeners.delete(fn)
      return origOff('data', wrapped)
    }
    return origOff(event, fn)
  }

  return inner
}
