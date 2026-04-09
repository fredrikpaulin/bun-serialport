// Enumerate available serial ports.
// Linux: scan /sys/class/tty and /dev/
// macOS: scan /dev/ for cu.* and tty.* devices

import { platform } from 'node:os'
import { readdir, readFile, readlink, access } from 'node:fs/promises'
import { join, basename } from 'node:path'

const IS_LINUX = platform() === 'linux'

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function readFileQuiet(path) {
  try { return (await readFile(path, 'utf-8')).trim() } catch { return '' }
}

async function listLinux() {
  const ports = []
  const ttys = await readdir('/sys/class/tty').catch(() => [])

  for (const name of ttys) {
    const sysPath = `/sys/class/tty/${name}`
    const devicePath = join(sysPath, 'device')

    // Only real serial devices have a device symlink
    if (!await exists(devicePath)) continue

    const devPath = `/dev/${name}`
    if (!await exists(devPath)) continue

    const info = { path: devPath }

    // Try to read USB metadata
    const subsystem = await readlink(join(devicePath, 'subsystem')).catch(() => '')
    if (subsystem.includes('usb-serial') || subsystem.includes('usb')) {
      // Walk up to find the USB device node
      const usbDevice = await findUsbParent(devicePath)
      if (usbDevice) {
        info.manufacturer = await readFileQuiet(join(usbDevice, 'manufacturer'))
        info.serialNumber = await readFileQuiet(join(usbDevice, 'serial'))
        info.vendorId = await readFileQuiet(join(usbDevice, 'idVendor'))
        info.productId = await readFileQuiet(join(usbDevice, 'idProduct'))
        info.product = await readFileQuiet(join(usbDevice, 'product'))
      }
    }

    ports.push(info)
  }

  return ports
}

async function findUsbParent(devicePath) {
  let current = devicePath
  for (let i = 0; i < 10; i++) {
    current = join(current, '..')
    if (await exists(join(current, 'idVendor'))) return current
  }
  return null
}

async function listDarwin() {
  const ports = []
  const devFiles = await readdir('/dev').catch(() => [])

  for (const name of devFiles) {
    // macOS serial ports: cu.* and tty.* (cu.* is the more useful one)
    if (!name.startsWith('cu.') && !name.startsWith('tty.')) continue
    // Skip pseudo-terminals and built-in console
    if (name === 'tty') continue

    const devPath = `/dev/${name}`
    ports.push({ path: devPath })
  }

  // Deduplicate: prefer cu.* over tty.* for the same device
  // (cu.* doesn't wait for carrier detect, better for robotics)
  return ports
}

export async function list() {
  return IS_LINUX ? listLinux() : listDarwin()
}
