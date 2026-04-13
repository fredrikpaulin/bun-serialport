// Readline parser — convenience wrapper around delimiter parser.
// Splits on newline, returns strings.

import { delimiterParser } from './delimiter.js'

export function readlineParser(options = {}) {
  const { delimiter = '\n', encoding = 'utf-8' } = options
  const inner = delimiterParser({ delimiter })
  const decoder = new TextDecoder(encoding)

  // Wrap the inner emitter to decode data to string
  const origOn = inner.on.bind(inner)
  const origOnce = inner.once.bind(inner)
  const origOff = inner.off.bind(inner)
  const listeners = new Map()

  function wrapFn(fn) {
    const wrapped = (buf) => fn(decoder.decode(buf))
    listeners.set(fn, wrapped)
    return wrapped
  }

  inner.on = function (event, fn) {
    if (event === 'data') return origOn('data', wrapFn(fn))
    return origOn(event, fn)
  }

  inner.once = function (event, fn) {
    if (event === 'data') return origOnce('data', wrapFn(fn))
    return origOnce(event, fn)
  }

  inner.off = function (event, fn) {
    if (event === 'data' && listeners.has(fn)) {
      const wrapped = listeners.get(fn)
      listeners.delete(fn)
      return origOff('data', wrapped)
    }
    return origOff(event, fn)
  }

  // Alias removeListener to off for full EventEmitter compat
  inner.removeListener = inner.off

  return inner
}
