import { test, expect } from 'bun:test'
import { mkdtemp, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readPnpIds } from '../src/list.js'

test('readPnpIds maps tty names to by-id symlink names', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'by-id-'))
  await symlink('../../ttyUSB0', join(dir, 'usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0'))
  await symlink('../../ttyACM1', join(dir, 'usb-Arduino__www.arduino.cc__0043_75830303934351A09081-if00'))

  const map = await readPnpIds(dir)
  expect(map.ttyUSB0).toBe('usb-FTDI_FT232R_USB_UART_A50285BI-if00-port0')
  expect(map.ttyACM1).toBe('usb-Arduino__www.arduino.cc__0043_75830303934351A09081-if00')
  await rm(dir, { recursive: true })
})

test('readPnpIds returns empty map when the directory is missing', async () => {
  expect(await readPnpIds('/nonexistent/by-id')).toEqual({})
})
