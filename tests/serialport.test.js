import { test, expect } from 'bun:test'
import { SerialPort } from '../src/serialport.js'

test('SerialPort requires path', () => {
  expect(() => new SerialPort({ baudRate: 9600 })).toThrow('path is required')
})

test('SerialPort requires baudRate', () => {
  expect(() => new SerialPort({ path: '/dev/null' })).toThrow('baudRate is required')
})

test('SerialPort constructor sets properties', () => {
  const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 115200, autoOpen: false })
  expect(port.path).toBe('/dev/ttyUSB0')
  expect(port.baudRate).toBe(115200)
  expect(port.isOpen).toBe(false)
})

test('SerialPort write rejects when closed', async () => {
  const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600, autoOpen: false })
  expect(port.write(new Uint8Array([1]))).rejects.toThrow('Port is not open')
})

test('SerialPort close rejects when not open', async () => {
  const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600, autoOpen: false })
  expect(port.close()).rejects.toThrow('Port is not open')
})

test('SerialPort update rejects when not open', async () => {
  const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 9600, autoOpen: false })
  expect(port.update({ baudRate: 19200 })).rejects.toThrow('Port is not open')
})
