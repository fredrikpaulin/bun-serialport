import { test, expect } from 'bun:test'
import {
  encodeBaudRate, isStandardBaudRate, dataBitsFlag,
  TERMIOS2_SIZE, TCGETS2, TCSETS2, BOTHER,
  EAGAIN, EINTR,
  CS5, CS6, CS7, CS8,
  TERMIOS_SIZE, NCCS, TCFLAG_SIZE,
  O_RDWR, O_NOCTTY, O_NONBLOCK,
  TIOCMGET, TIOCM_DTR, TIOCM_RTS
} from '../src/bindings/constants.js'
import { platform } from 'node:os'

const IS_LINUX = platform() === 'linux'

test('dataBitsFlag returns correct values', () => {
  expect(dataBitsFlag(5)).toBe(CS5)
  expect(dataBitsFlag(6)).toBe(CS6)
  expect(dataBitsFlag(7)).toBe(CS7)
  expect(dataBitsFlag(8)).toBe(CS8)
})

test('dataBitsFlag rejects invalid values', () => {
  expect(() => dataBitsFlag(4)).toThrow('Invalid data bits')
  expect(() => dataBitsFlag(9)).toThrow('Invalid data bits')
})

test('encodeBaudRate handles common rates', () => {
  // Should not throw for standard rates
  expect(() => encodeBaudRate(9600)).not.toThrow()
  expect(() => encodeBaudRate(115200)).not.toThrow()

  if (IS_LINUX) {
    // Linux encodes baud rates
    expect(encodeBaudRate(9600)).toBe(13)
    expect(encodeBaudRate(115200)).toBe(0x1002)
  } else {
    // macOS uses literal values
    expect(encodeBaudRate(9600)).toBe(9600)
    expect(encodeBaudRate(115200)).toBe(115200)
  }
})

test('off-table rates are recognized as custom, not rejected', () => {
  expect(isStandardBaudRate(9600)).toBe(true)
  expect(isStandardBaudRate(250000)).toBe(false)
  expect(isStandardBaudRate(74880)).toBe(false)
  if (IS_LINUX) expect(encodeBaudRate(250000)).toBeUndefined()
  else expect(encodeBaudRate(250000)).toBe(250000)
})

test('legacy rates are in the Linux table', () => {
  if (!IS_LINUX) return
  expect(encodeBaudRate(50)).toBe(1)
  expect(encodeBaudRate(200)).toBe(6)
  expect(encodeBaudRate(1800)).toBe(10)
})

test('termios2 constants match the kernel headers', () => {
  expect(TERMIOS2_SIZE).toBe(44)
  expect(TCGETS2).toBe(0x802c542a)
  expect(TCSETS2).toBe(0x402c542b)
  expect(BOTHER).toBe(0x1000)
})

test('termios struct size is correct for platform', () => {
  if (IS_LINUX) {
    expect(TERMIOS_SIZE).toBe(60)
    expect(NCCS).toBe(32)
    expect(TCFLAG_SIZE).toBe(4)
  } else {
    expect(TERMIOS_SIZE).toBe(72)
    expect(NCCS).toBe(20)
    expect(TCFLAG_SIZE).toBe(8)
  }
})

test('open flags are nonzero', () => {
  expect(O_RDWR).toBeGreaterThan(0)
  expect(O_NOCTTY).toBeGreaterThan(0)
  expect(O_NONBLOCK).toBeGreaterThan(0)
})

test('errno constants are platform-correct', () => {
  expect(EAGAIN).toBe(IS_LINUX ? 11 : 35)
  expect(EINTR).toBe(4)
})

test('ioctl modem constants are defined', () => {
  expect(TIOCMGET).toBeGreaterThan(0)
  expect(TIOCM_DTR).toBe(2)
  expect(TIOCM_RTS).toBe(4)
})
