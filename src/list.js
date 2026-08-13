// Enumerate available serial ports.
// Linux: scan /sys/class/tty and /dev/
// macOS: scan /dev/ for cu.* and tty.* devices

import { platform } from 'node:os'
import { readdir, readlink, realpath, access } from 'node:fs/promises'
import { join, basename } from 'node:path'

const IS_LINUX = platform() === 'linux'

async function exists(path) {
  // Bun.file().exists() only covers regular files here; /sys and /dev need access().
  try { await access(path); return true } catch { return false }
}

async function readFileQuiet(path) {
  try { return (await Bun.file(path).text()).trim() } catch { return '' }
}

// /dev/serial/by-id gives stable identity across replugs — the symlink name
// is the pnpId, the target says which tty it belongs to.
export async function readPnpIds(byIdDir = '/dev/serial/by-id') {
  const entries = await readdir(byIdDir).catch(() => [])
  const map = {}
  await Promise.all(entries.map(async (entry) => {
    const target = await readlink(join(byIdDir, entry)).catch(() => '')
    if (target) map[basename(target)] = entry
  }))
  return map
}

async function listLinux() {
  const ttys = await readdir('/sys/class/tty').catch(() => [])
  const pnpIds = await readPnpIds()

  // Filter to real serial devices in parallel
  const checks = ttys.map(async (name) => {
    const sysPath = `/sys/class/tty/${name}`
    const devicePath = join(sysPath, 'device')
    if (!await exists(devicePath)) return null

    const devPath = `/dev/${name}`
    if (!await exists(devPath)) return null

    return { name, devPath, devicePath }
  })

  const valid = (await Promise.all(checks)).filter(Boolean)

  // Read USB metadata in parallel for each valid port
  const ports = await Promise.all(valid.map(async ({ name, devPath, devicePath }) => {
    const info = { path: devPath }
    if (pnpIds[name]) info.pnpId = pnpIds[name]

    const subsystem = await readlink(join(devicePath, 'subsystem')).catch(() => '')
    if (subsystem.includes('usb-serial') || subsystem.includes('usb')) {
      const usbDevice = await findUsbParent(devicePath)
      if (usbDevice) {
        // locationId is the sysfs USB devpath (e.g. "1-1.4") — physical port
        // position, stable as long as the cable stays where it is
        info.locationId = await realpath(usbDevice).then(basename).catch(() => undefined)
        const [manufacturer, serialNumber, vendorId, productId, product] = await Promise.all([
          readFileQuiet(join(usbDevice, 'manufacturer')),
          readFileQuiet(join(usbDevice, 'serial')),
          readFileQuiet(join(usbDevice, 'idVendor')),
          readFileQuiet(join(usbDevice, 'idProduct')),
          readFileQuiet(join(usbDevice, 'product')),
        ])
        info.manufacturer = manufacturer
        info.serialNumber = serialNumber
        info.vendorId = vendorId
        info.productId = productId
        info.product = product
      }
    }

    return info
  }))

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
  const devFiles = await readdir('/dev').catch(() => [])
  const seen = new Map() // device suffix -> port info

  for (const name of devFiles) {
    if (!name.startsWith('cu.') && !name.startsWith('tty.')) continue
    if (name === 'tty') continue

    const isCu = name.startsWith('cu.')
    const suffix = name.slice(isCu ? 3 : 4)

    // Prefer cu.* over tty.* (cu.* doesn't wait for carrier detect)
    if (seen.has(suffix) && !isCu) continue

    seen.set(suffix, { path: `/dev/${name}` })
  }

  return [...seen.values()]
}

export async function list() {
  return IS_LINUX ? listLinux() : listDarwin()
}
