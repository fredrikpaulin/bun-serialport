import { test, expect } from 'bun:test'
import { delimiterParser, byteLengthParser, readlineParser } from '../src/parsers/index.js'

// --- delimiterParser ---

test('delimiterParser splits on newline byte', () => {
  const parser = delimiterParser({ delimiter: 0x0a })
  const results = []
  parser.on('data', (d) => results.push(d))

  parser.push(new Uint8Array([0x41, 0x42, 0x0a, 0x43, 0x0a]))

  expect(results.length).toBe(2)
  expect(Array.from(results[0])).toEqual([0x41, 0x42])
  expect(Array.from(results[1])).toEqual([0x43])
})

test('delimiterParser handles split across chunks', () => {
  const parser = delimiterParser({ delimiter: '\n' })
  const results = []
  parser.on('data', (d) => results.push(d))

  parser.push(new TextEncoder().encode('hel'))
  parser.push(new TextEncoder().encode('lo\nwor'))
  parser.push(new TextEncoder().encode('ld\n'))

  expect(results.length).toBe(2)
  expect(new TextDecoder().decode(results[0])).toBe('hello')
  expect(new TextDecoder().decode(results[1])).toBe('world')
})

test('delimiterParser with multi-byte delimiter', () => {
  const parser = delimiterParser({ delimiter: [0x0d, 0x0a] })
  const results = []
  parser.on('data', (d) => results.push(d))

  parser.push(new Uint8Array([0x41, 0x0d, 0x0a, 0x42, 0x0d, 0x0a]))

  expect(results.length).toBe(2)
  expect(Array.from(results[0])).toEqual([0x41])
  expect(Array.from(results[1])).toEqual([0x42])
})

test('delimiterParser includeDelimiter option', () => {
  const parser = delimiterParser({ delimiter: 0x0a, includeDelimiter: true })
  const results = []
  parser.on('data', (d) => results.push(d))

  parser.push(new Uint8Array([0x41, 0x0a, 0x42, 0x0a]))

  expect(results.length).toBe(2)
  expect(Array.from(results[0])).toEqual([0x41, 0x0a])
  expect(Array.from(results[1])).toEqual([0x42, 0x0a])
})

// --- byteLengthParser ---

test('byteLengthParser emits fixed-size chunks', () => {
  const parser = byteLengthParser({ length: 3 })
  const results = []
  parser.on('data', (d) => results.push(d))

  parser.push(new Uint8Array([1, 2, 3, 4, 5, 6, 7]))

  expect(results.length).toBe(2)
  expect(Array.from(results[0])).toEqual([1, 2, 3])
  expect(Array.from(results[1])).toEqual([4, 5, 6])
  // byte 7 should be buffered, not emitted
})

test('byteLengthParser across multiple chunks', () => {
  const parser = byteLengthParser({ length: 4 })
  const results = []
  parser.on('data', (d) => results.push(d))

  parser.push(new Uint8Array([1, 2]))
  parser.push(new Uint8Array([3, 4, 5]))

  expect(results.length).toBe(1)
  expect(Array.from(results[0])).toEqual([1, 2, 3, 4])
})

test('byteLengthParser rejects length < 1', () => {
  expect(() => byteLengthParser({ length: 0 })).toThrow('length must be >= 1')
})

// --- readlineParser ---

test('readlineParser emits strings', () => {
  const parser = readlineParser()
  const results = []
  parser.on('data', (d) => results.push(d))

  parser.push(new TextEncoder().encode('hello\nworld\n'))

  expect(results).toEqual(['hello', 'world'])
})

test('readlineParser with custom delimiter', () => {
  const parser = readlineParser({ delimiter: '\r\n' })
  const results = []
  parser.on('data', (d) => results.push(d))

  parser.push(new TextEncoder().encode('line1\r\nline2\r\n'))

  expect(results).toEqual(['line1', 'line2'])
})
