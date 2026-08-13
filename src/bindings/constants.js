// Platform-specific termios constants for bun:ffi serial port access.
// Values differ between Linux and macOS — we detect at import time.

import { platform } from 'node:os'

const IS_LINUX = platform() === 'linux'
const IS_DARWIN = platform() === 'darwin'

if (!IS_LINUX && !IS_DARWIN) {
  throw new Error(`bun-serialport: unsupported platform "${platform()}"`)
}

// --- Open flags ---
export const O_RDWR = 2
export const O_NOCTTY = IS_LINUX ? 256 : 0x20000
export const O_NONBLOCK = IS_LINUX ? 2048 : 4
export const O_CLOEXEC = IS_LINUX ? 0x80000 : 0x1000000

// --- flock ---
export const LOCK_EX = 2
export const LOCK_NB = 4

// --- errno ---
// EAGAIN differs per platform; the other platform's value is EDEADLK — never
// treat it as "try again" (audit finding B5).
export const EAGAIN = IS_LINUX ? 11 : 35
export const EINTR = 4

// --- tcsetattr actions ---
export const TCSANOW = 0
export const TCSADRAIN = 1
export const TCSAFLUSH = 2

// --- tcflush queue selectors ---
export const TCIFLUSH = IS_LINUX ? 0 : 1
export const TCOFLUSH = IS_LINUX ? 1 : 2
export const TCIOFLUSH = IS_LINUX ? 2 : 3

// --- Control flags (c_cflag) ---
export const CSIZE = IS_LINUX ? 0x30 : 0x300
export const CS5 = IS_LINUX ? 0x00 : 0x000
export const CS6 = IS_LINUX ? 0x10 : 0x100
export const CS7 = IS_LINUX ? 0x20 : 0x200
export const CS8 = IS_LINUX ? 0x30 : 0x300
export const CSTOPB = IS_LINUX ? 0x40 : 0x400
export const CREAD = IS_LINUX ? 0x80 : 0x800
export const PARENB = IS_LINUX ? 0x100 : 0x1000
export const PARODD = IS_LINUX ? 0x200 : 0x2000
export const CLOCAL = IS_LINUX ? 0x800 : 0x8000
export const HUPCL = IS_LINUX ? 0x400 : 0x4000
export const CRTSCTS = IS_LINUX ? 0x80000000 : 0x30000

// --- Input flags (c_iflag) ---
export const IGNBRK = 1
export const BRKINT = 2
export const IGNPAR = 4
export const PARMRK = 8
export const INPCK = IS_LINUX ? 0x10 : 0x10
export const ISTRIP = IS_LINUX ? 0x20 : 0x20
export const INLCR = IS_LINUX ? 0x40 : 0x40
export const IGNCR = IS_LINUX ? 0x80 : 0x80
export const ICRNL = IS_LINUX ? 0x100 : 0x100
export const IXON = IS_LINUX ? 0x400 : 0x200
export const IXOFF = IS_LINUX ? 0x1000 : 0x400
export const IXANY = IS_LINUX ? 0x800 : 0x800

// --- Output flags (c_oflag) ---
export const OPOST = 1

// --- Local flags (c_lflag) ---
export const ISIG = IS_LINUX ? 1 : 0x80
export const ICANON = IS_LINUX ? 2 : 0x100
export const ECHO = IS_LINUX ? 8 : 0x8
export const ECHOE = IS_LINUX ? 0x10 : 0x2
export const ECHOK = IS_LINUX ? 0x20 : 0x4
export const ECHONL = IS_LINUX ? 0x40 : 0x10
export const NOFLSH = IS_LINUX ? 0x80 : 0x80000000
export const TOSTOP = IS_LINUX ? 0x100 : 0x400000
export const IEXTEN = IS_LINUX ? 0x8000 : 0x400

// --- Special character indices ---
export const VMIN = IS_LINUX ? 6 : 16
export const VTIME = IS_LINUX ? 5 : 17
export const NCCS = IS_LINUX ? 32 : 20

// --- ioctl modem control ---
export const TIOCMGET = IS_LINUX ? 0x5415 : 0x4004746a
export const TIOCMSET = IS_LINUX ? 0x5418 : 0x8004746d
export const TIOCMBIS = IS_LINUX ? 0x5416 : 0x8004746c
export const TIOCMBIC = IS_LINUX ? 0x5417 : 0x8004746b

// --- ioctl break signal ---
export const TIOCSBRK = IS_LINUX ? 0x5427 : 0x2000747b
export const TIOCCBRK = IS_LINUX ? 0x5428 : 0x2000747a

// --- Modem line bits ---
export const TIOCM_DTR = 0x002
export const TIOCM_RTS = 0x004
export const TIOCM_CTS = 0x020
export const TIOCM_DSR = 0x100
export const TIOCM_CD = 0x040
export const TIOCM_RI = 0x080

// --- termios struct layout ---
// Linux: tcflag_t = uint32, cc_t = uint8, speed_t = uint32, NCCS = 32
//   struct: c_iflag(4) + c_oflag(4) + c_cflag(4) + c_lflag(4) + c_line(1) + c_cc[32](32) + pad(3) + c_ispeed(4) + c_ospeed(4) = 60
// macOS:  tcflag_t = unsigned long (8 on 64-bit), cc_t = uint8, speed_t = unsigned long (8), NCCS = 20
//   struct: c_iflag(8) + c_oflag(8) + c_cflag(8) + c_lflag(8) + c_cc[20](20) + pad(4) + c_ispeed(8) + c_ospeed(8) = 72

export const TERMIOS_SIZE = IS_LINUX ? 60 : 72
export const TCFLAG_SIZE = IS_LINUX ? 4 : 8
export const SPEED_SIZE = IS_LINUX ? 4 : 8

// Offsets into the termios struct
export const TERMIOS_OFFSETS = IS_LINUX
  ? { c_iflag: 0, c_oflag: 4, c_cflag: 8, c_lflag: 12, c_line: 16, c_cc: 17, c_ispeed: 52, c_ospeed: 56 }
  : { c_iflag: 0, c_oflag: 8, c_cflag: 16, c_lflag: 24, c_cc: 32, c_ispeed: 56, c_ospeed: 64 }

// --- Baud rate mapping ---
// Linux uses encoded constants; macOS uses the literal baud rate value.
const LINUX_BAUD_MAP = {
  0: 0, 50: 1, 75: 2, 110: 3, 134: 4, 150: 5, 200: 6,
  300: 7, 600: 8, 1200: 9, 1800: 10, 2400: 11, 4800: 12,
  9600: 13, 19200: 14, 38400: 15, 57600: 0x1001, 115200: 0x1002,
  230400: 0x1003, 460800: 0x1004, 500000: 0x1005, 576000: 0x1006,
  921600: 0x1007, 1000000: 0x1008, 1152000: 0x1009, 1500000: 0x100a,
  2000000: 0x100b, 2500000: 0x100c, 3000000: 0x100d, 3500000: 0x100e,
  4000000: 0x100f
}

export const SUPPORTED_BAUD_RATES = Object.freeze(
  Object.keys(LINUX_BAUD_MAP)
    .map(Number)
    .filter((rate) => rate > 0)
    .sort((a, b) => a - b)
)

// A rate in the classic Bxxx table. Rates outside it are still usable —
// they take the platform's custom-rate path (termios2/BOTHER on Linux,
// IOSSIOSPEED on macOS).
export function isStandardBaudRate(rate) {
  return LINUX_BAUD_MAP[rate] !== undefined
}

export function encodeBaudRate(rate) {
  if (IS_DARWIN) return rate // macOS uses literal values
  return LINUX_BAUD_MAP[rate] // undefined for custom rates — caller branches
}

// --- Custom baud rate plumbing ---
// Linux: struct termios2 from asm-generic/termbits.h — NCCS is 19 here, not
// the glibc 32. Layout: 4 x u32 flags, c_line u8, c_cc[19], c_ispeed u32 at
// 36, c_ospeed u32 at 40, total 44 bytes.
export const TERMIOS2_SIZE = 44
export const TERMIOS2_OFFSETS = { c_cflag: 8, c_ispeed: 36, c_ospeed: 40 }
export const TCGETS2 = 0x802c542a
export const TCSETS2 = 0x402c542b
export const BOTHER = 0x1000
export const CBAUD = 0x100f
// macOS: _IOW('T', 2, speed_t) with an 8-byte speed_t
export const IOSSIOSPEED = 0x80085402

export function dataBitsFlag(bits) {
  switch (bits) {
    case 5: return CS5
    case 6: return CS6
    case 7: return CS7
    case 8: return CS8
    default: throw new Error(`Invalid data bits: ${bits}`)
  }
}
