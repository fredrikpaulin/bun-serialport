// Readline parser — convenience wrapper around delimiter parser.
// Splits on newline, returns strings.

import { EventEmitter } from 'node:events'
import { delimiterParser } from './delimiter.js'

export function readlineParser(options = {}) {
  const { delimiter = '\n', encoding = 'utf-8' } = options
  const inner = delimiterParser({ delimiter })
  const decoder = new TextDecoder(encoding)
  const emitter = new EventEmitter()

  inner.on('data', (buf) => emitter.emit('data', decoder.decode(buf)))
  emitter.push = (chunk) => inner.push(chunk)

  return emitter
}
