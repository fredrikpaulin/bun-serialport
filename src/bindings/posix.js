// POSIX serial port bindings via bun:ffi.
// Calls libc directly — no native addon, no compilation step.

import { dlopen, FFIType, ptr, toBuffer, toArrayBuffer, CString } from 'bun:ffi'
import {
  O_RDWR, O_NOCTTY, O_NONBLOCK, F_GETFL, F_SETFL,
  TCSANOW, TCSAFLUSH, TCIFLUSH, TCOFLUSH, TCIOFLUSH,
  CSIZE, CREAD, CLOCAL, CSTOPB, PARENB, PARODD, CRTSCTS,
  IGNBRK, BRKINT, IGNPAR, PARMRK, INPCK, ISTRIP, INLCR, IGNCR, ICRNL,
  IXON, IXOFF, IXANY, OPOST,
  ISIG, ICANON, ECHO, ECHOE, ECHOK, ECHONL, NOFLSH, TOSTOP, IEXTEN,
  VMIN, VTIME, NCCS,
  TIOCMGET, TIOCMSET, TIOCMBIS, TIOCMBIC,
  TIOCM_DTR, TIOCM_RTS, TIOCM_CTS, TIOCM_DSR, TIOCM_CD, TIOCM_RI,
  TERMIOS_SIZE, TCFLAG_SIZE, TERMIOS_OFFSETS,
  encodeBaudRate, dataBitsFlag
} from './constants.js'
import { platform } from 'node:os'

const IS_LINUX = platform() === 'linux'
const IS_DARWIN = platform() === 'darwin'

// Load libc
const LIBC_PATH = IS_LINUX ? 'libc.so.6' : 'libSystem.B.dylib'

const libc = dlopen(LIBC_PATH, {
  open: { args: [FFIType.cstring, FFIType.i32], returns: FFIType.i32 },
  close: { args: [FFIType.i32], returns: FFIType.i32 },
  read: { args: [FFIType.i32, FFIType.ptr, FFIType.u64], returns: FFIType.i64 },
  write: { args: [FFIType.i32, FFIType.ptr, FFIType.u64], returns: FFIType.i64 },
  tcgetattr: { args: [FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
  tcsetattr: { args: [FFIType.i32, FFIType.i32, FFIType.ptr], returns: FFIType.i32 },
  tcflush: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  tcdrain: { args: [FFIType.i32], returns: FFIType.i32 },
  cfsetispeed: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
  cfsetospeed: { args: [FFIType.ptr, FFIType.u64], returns: FFIType.i32 },
  fcntl: { args: [FFIType.i32, FFIType.i32, FFIType.i32], returns: FFIType.i32 },
  ioctl: { args: [FFIType.i32, FFIType.u64, FFIType.ptr], returns: FFIType.i32 },
  strerror: { args: [FFIType.i32], returns: FFIType.ptr },
})

// Bun FFI doesn't expose errno directly. We read it from the thread-local.
// For now, we use __errno_location (Linux) or __error (macOS) to get errno pointer.
const errnoLib = dlopen(LIBC_PATH, IS_LINUX
  ? { __errno_location: { args: [], returns: FFIType.ptr } }
  : { __error: { args: [], returns: FFIType.ptr } }
)

function getErrno() {
  const errPtr = IS_LINUX
    ? errnoLib.symbols.__errno_location()
    : errnoLib.symbols.__error()
  const view = new DataView(toArrayBuffer(errPtr, 0, 4))
  return view.getInt32(0, true)
}

function errnoError(syscall) {
  const code = getErrno()
  const msgPtr = libc.symbols.strerror(code)
  const msg = msgPtr ? new CString(msgPtr) : `errno ${code}`
  const err = new Error(`${syscall}: ${msg}`)
  err.code = code
  err.syscall = syscall
  return err
}

// --- termios struct helpers ---

function readFlag(buf, offset) {
  if (TCFLAG_SIZE === 4) {
    return buf.getUint32(offset, true)
  }
  // macOS: 8-byte unsigned long, read lower 32 bits (baud/flag values fit in 32 bits)
  return Number(buf.getBigUint64(offset, true))
}

function writeFlag(buf, offset, value) {
  if (TCFLAG_SIZE === 4) {
    buf.setUint32(offset, value >>> 0, true)
  } else {
    buf.setBigUint64(offset, BigInt(value >>> 0), true)
  }
}

function writeSpeed(buf, offset, value) {
  if (TCFLAG_SIZE === 4) {
    buf.setUint32(offset, value >>> 0, true)
  } else {
    buf.setBigUint64(offset, BigInt(value), true)
  }
}

// --- Public API ---

export function openPort(path, options) {
  const {
    baudRate = 9600,
    dataBits = 8,
    stopBits = 1,
    parity = 'none',
    rtscts = false,
    xon = false,
    xoff = false,
  } = options

  // Open the device file
  const pathBuf = Buffer.from(path + '\0', 'utf-8')
  const fd = libc.symbols.open(ptr(pathBuf), O_RDWR | O_NOCTTY | O_NONBLOCK)
  if (fd < 0) throw errnoError('open')

  // Get current termios
  const termiosBuf = new ArrayBuffer(TERMIOS_SIZE)
  const termiosView = new DataView(termiosBuf)
  const termiosPtr = ptr(new Uint8Array(termiosBuf))

  if (libc.symbols.tcgetattr(fd, termiosPtr) < 0) {
    libc.symbols.close(fd)
    throw errnoError('tcgetattr')
  }

  const off = TERMIOS_OFFSETS

  // Build c_cflag: clear CSIZE, set data bits, enable receiver + local
  let cflag = readFlag(termiosView, off.c_cflag)
  cflag &= ~CSIZE
  cflag |= dataBitsFlag(dataBits)
  cflag |= CREAD | CLOCAL

  // Stop bits
  if (stopBits === 2) cflag |= CSTOPB
  else cflag &= ~CSTOPB

  // Parity
  if (parity === 'none') {
    cflag &= ~(PARENB | PARODD)
  } else if (parity === 'even') {
    cflag |= PARENB
    cflag &= ~PARODD
  } else if (parity === 'odd') {
    cflag |= PARENB | PARODD
  }

  // Hardware flow control
  if (rtscts) cflag |= CRTSCTS
  else cflag &= ~CRTSCTS

  writeFlag(termiosView, off.c_cflag, cflag)

  // Input flags: raw mode — clear everything
  let iflag = 0
  if (parity !== 'none') iflag |= INPCK
  if (xon) iflag |= IXON
  if (xoff) iflag |= IXOFF
  writeFlag(termiosView, off.c_iflag, iflag)

  // Output flags: raw
  writeFlag(termiosView, off.c_oflag, 0)

  // Local flags: raw
  writeFlag(termiosView, off.c_lflag, 0)

  // Special characters: VMIN=1, VTIME=0 (blocking read until at least 1 byte)
  const ccOffset = off.c_cc
  const termiosBytes = new Uint8Array(termiosBuf)
  // Clear all cc
  for (let i = 0; i < NCCS; i++) termiosBytes[ccOffset + i] = 0
  termiosBytes[ccOffset + VMIN] = 1
  termiosBytes[ccOffset + VTIME] = 0

  // Set baud rate
  const baudCode = encodeBaudRate(baudRate)
  if (IS_LINUX) {
    // Linux: write speed into c_ispeed and c_ospeed fields, and also
    // use cfsetispeed/cfsetospeed for the flag bits
    writeSpeed(termiosView, off.c_ispeed, baudCode)
    writeSpeed(termiosView, off.c_ospeed, baudCode)
  }
  // Use cfsetispeed/cfsetospeed which handles platform differences
  const termiosPtrFresh = ptr(new Uint8Array(termiosBuf))
  if (libc.symbols.cfsetispeed(termiosPtrFresh, baudCode) < 0) {
    libc.symbols.close(fd)
    throw errnoError('cfsetispeed')
  }
  if (libc.symbols.cfsetospeed(termiosPtrFresh, baudCode) < 0) {
    libc.symbols.close(fd)
    throw errnoError('cfsetospeed')
  }

  // Apply
  if (libc.symbols.tcsetattr(fd, TCSAFLUSH, termiosPtrFresh) < 0) {
    libc.symbols.close(fd)
    throw errnoError('tcsetattr')
  }

  // Flush any stale data
  libc.symbols.tcflush(fd, TCIOFLUSH)

  return fd
}

export function closePort(fd) {
  if (libc.symbols.close(fd) < 0) throw errnoError('close')
}

export function writePort(fd, data) {
  // data should be Uint8Array or Buffer
  const buf = data instanceof Uint8Array ? data : Buffer.from(data, 'utf-8')
  let offset = 0
  while (offset < buf.length) {
    const slice = buf.subarray(offset)
    const written = Number(libc.symbols.write(fd, ptr(slice), BigInt(slice.length)))
    if (written < 0) {
      const code = getErrno()
      if (code === 11 || code === 35) {
        // EAGAIN / EWOULDBLOCK — try again
        continue
      }
      throw errnoError('write')
    }
    offset += written
  }
  return offset
}

export function readPort(fd, buffer) {
  // Non-blocking read into the provided buffer
  const n = Number(libc.symbols.read(fd, ptr(buffer), BigInt(buffer.length)))
  if (n < 0) {
    const code = getErrno()
    if (code === 11 || code === 35) return 0 // EAGAIN — no data available
    throw errnoError('read')
  }
  return n
}

export function updateBaudRate(fd, baudRate) {
  const termiosBuf = new ArrayBuffer(TERMIOS_SIZE)
  const termiosPtr = ptr(new Uint8Array(termiosBuf))

  if (libc.symbols.tcgetattr(fd, termiosPtr) < 0) throw errnoError('tcgetattr')

  const baudCode = encodeBaudRate(baudRate)
  if (libc.symbols.cfsetispeed(termiosPtr, baudCode) < 0) throw errnoError('cfsetispeed')
  if (libc.symbols.cfsetospeed(termiosPtr, baudCode) < 0) throw errnoError('cfsetospeed')

  if (IS_LINUX) {
    const view = new DataView(termiosBuf)
    writeSpeed(view, TERMIOS_OFFSETS.c_ispeed, baudCode)
    writeSpeed(view, TERMIOS_OFFSETS.c_ospeed, baudCode)
  }

  if (libc.symbols.tcsetattr(fd, TCSADRAIN, termiosPtr) < 0) throw errnoError('tcsetattr')
}

export function setModemLines(fd, flags) {
  const { dtr, rts, brk } = flags
  const intBuf = new ArrayBuffer(4)
  const intView = new DataView(intBuf)
  const intPtr = ptr(new Uint8Array(intBuf))

  // Set lines that are explicitly true
  let bitsToSet = 0
  let bitsToClear = 0

  if (dtr === true) bitsToSet |= TIOCM_DTR
  if (dtr === false) bitsToClear |= TIOCM_DTR
  if (rts === true) bitsToSet |= TIOCM_RTS
  if (rts === false) bitsToClear |= TIOCM_RTS

  if (bitsToSet) {
    intView.setInt32(0, bitsToSet, true)
    if (libc.symbols.ioctl(fd, TIOCMBIS, intPtr) < 0) throw errnoError('ioctl TIOCMBIS')
  }
  if (bitsToClear) {
    intView.setInt32(0, bitsToClear, true)
    if (libc.symbols.ioctl(fd, TIOCMBIC, intPtr) < 0) throw errnoError('ioctl TIOCMBIC')
  }
}

export function getModemLines(fd) {
  const intBuf = new ArrayBuffer(4)
  const intView = new DataView(intBuf)
  const intPtr = ptr(new Uint8Array(intBuf))

  if (libc.symbols.ioctl(fd, TIOCMGET, intPtr) < 0) throw errnoError('ioctl TIOCMGET')

  const bits = intView.getInt32(0, true)
  return {
    cts: !!(bits & TIOCM_CTS),
    dsr: !!(bits & TIOCM_DSR),
    dcd: !!(bits & TIOCM_CD),
    ri: !!(bits & TIOCM_RI),
  }
}

export function flushPort(fd) {
  if (libc.symbols.tcflush(fd, TCIOFLUSH) < 0) throw errnoError('tcflush')
}

export function drainPort(fd) {
  if (libc.symbols.tcdrain(fd) < 0) throw errnoError('tcdrain')
}
