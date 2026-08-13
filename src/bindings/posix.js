// POSIX serial port bindings via bun:ffi.
// Calls libc directly — no native addon, no compilation step.

import { dlopen, FFIType, ptr, toArrayBuffer, CString } from 'bun:ffi'
import {
  O_RDWR, O_NOCTTY, O_NONBLOCK, O_CLOEXEC,
  LOCK_EX, LOCK_NB,
  TCSADRAIN, TCSAFLUSH, TCIOFLUSH,
  CSIZE, CREAD, CLOCAL, CSTOPB, PARENB, PARODD, CRTSCTS, HUPCL,
  INPCK, IGNPAR, IXON, IXOFF, IXANY,
  VMIN, VTIME, NCCS,
  TIOCMGET, TIOCMBIS, TIOCMBIC, TIOCSBRK, TIOCCBRK,
  TIOCM_DTR, TIOCM_RTS, TIOCM_CTS, TIOCM_DSR, TIOCM_CD, TIOCM_RI,
  EAGAIN, EINTR,
  TERMIOS_SIZE, TCFLAG_SIZE, TERMIOS_OFFSETS,
  TERMIOS2_SIZE, TERMIOS2_OFFSETS, TCGETS2, TCSETS2, BOTHER, CBAUD, IOSSIOSPEED,
  encodeBaudRate, isStandardBaudRate, dataBitsFlag
} from './constants.js'
import { platform } from 'node:os'

const IS_LINUX = platform() === 'linux'
const IS_DARWIN = platform() === 'darwin'
const textEncoder = new TextEncoder()

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
  flock: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
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

function unsupportedOption(name, value) {
  throw new Error(`Invalid ${name}: ${value}`)
}

function validateBaudRate(rate) {
  if (!Number.isInteger(rate) || rate <= 0) {
    throw new Error(`Unsupported baud rate: ${rate}`)
  }
  return rate
}

// Rates outside the Bxxx table. Linux: termios2 with BOTHER, raw ioctl —
// this bypasses glibc entirely, so the struct is the kernel's 44-byte one.
// macOS: IOSSIOSPEED, which tells the driver the literal rate.
function setCustomBaudRate(fd, rate) {
  if (IS_LINUX) {
    const t2 = new Uint8Array(TERMIOS2_SIZE)
    const view = new DataView(t2.buffer)
    const t2Ptr = ptr(t2)
    if (libc.symbols.ioctl(fd, TCGETS2, t2Ptr) < 0) throw errnoError('ioctl TCGETS2')
    let cflag = view.getUint32(TERMIOS2_OFFSETS.c_cflag, true)
    cflag = (cflag & ~CBAUD & ~(CBAUD << 16)) | BOTHER // clear CIBAUD: input follows output
    view.setUint32(TERMIOS2_OFFSETS.c_cflag, cflag >>> 0, true)
    view.setUint32(TERMIOS2_OFFSETS.c_ispeed, rate, true)
    view.setUint32(TERMIOS2_OFFSETS.c_ospeed, rate, true)
    if (libc.symbols.ioctl(fd, TCSETS2, t2Ptr) < 0) throw errnoError('ioctl TCSETS2')
  } else {
    const speed = new Uint8Array(8)
    new DataView(speed.buffer).setBigUint64(0, BigInt(rate), true)
    if (libc.symbols.ioctl(fd, IOSSIOSPEED, ptr(speed)) < 0) throw errnoError('ioctl IOSSIOSPEED')
  }
}

function toBytes(data) {
  if (data instanceof Uint8Array) return data
  if (typeof data === 'string') return textEncoder.encode(data)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  if (Array.isArray(data)) return new Uint8Array(data)
  throw new TypeError('write data must be a Uint8Array, ArrayBuffer, array of bytes, or string')
}

export function validateOpenOptions(options = {}) {
  const {
    baudRate = 9600,
    dataBits = 8,
    stopBits = 1,
    parity = 'none',
    readBufferSize,
    readInterval,
  } = options

  validateBaudRate(baudRate)
  dataBitsFlag(dataBits)

  for (const name of ['rtscts', 'xon', 'xoff', 'xany', 'hupcl', 'lock', 'autoOpen']) {
    if (options[name] !== undefined && typeof options[name] !== 'boolean') {
      unsupportedOption(name, options[name])
    }
  }

  if (stopBits !== 1 && stopBits !== 2) unsupportedOption('stop bits', stopBits)
  if (parity !== 'none' && parity !== 'even' && parity !== 'odd') unsupportedOption('parity', parity)
  if (readBufferSize !== undefined && (!Number.isInteger(readBufferSize) || readBufferSize < 1)) {
    unsupportedOption('read buffer size', readBufferSize)
  }
  if (readInterval !== undefined && (!Number.isFinite(readInterval) || readInterval < 1)) {
    unsupportedOption('read interval', readInterval)
  }
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

export function openPort(path, options = {}) {
  validateOpenOptions(options)

  const {
    baudRate = 9600,
    dataBits = 8,
    stopBits = 1,
    parity = 'none',
    rtscts = false,
    hupcl = true,
    lock = true,
    xon = false,
    xoff = false,
    xany = false,
  } = options

  // Open the device file. O_CLOEXEC so spawned children don't inherit the
  // port — an inherited fd keeps DTR asserted and the lock held after the
  // parent closes.
  const pathBuf = textEncoder.encode(path + '\0')
  const fd = libc.symbols.open(ptr(pathBuf), O_RDWR | O_NOCTTY | O_NONBLOCK | O_CLOEXEC)
  if (fd < 0) throw errnoError('open')

  // Exclusive access. flock only guards against other flock users, but that
  // covers the realistic failure: two of your own processes on one port.
  if (lock) {
    if (libc.symbols.flock(fd, LOCK_EX | LOCK_NB) < 0) {
      const cause = errnoError('flock')
      libc.symbols.close(fd)
      throw new Error(`Cannot lock ${path}: port may be in use by another process (${cause.message})`)
    }
  }

  // Get current termios — keep one Uint8Array alive so ptr() stays valid
  const termiosBuf = new ArrayBuffer(TERMIOS_SIZE)
  const termiosBytes = new Uint8Array(termiosBuf)
  const termiosView = new DataView(termiosBuf)
  const termiosPtr = ptr(termiosBytes)

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

  // Hang-up on close: drop DTR/RTS when the port closes. Devices that
  // reset on a DTR edge (most Arduino/ESP dev boards) need hupcl: false
  // to survive an open-write-close sequence.
  if (hupcl) cflag |= HUPCL
  else cflag &= ~HUPCL

  writeFlag(termiosView, off.c_cflag, cflag)

  // Input flags: raw mode. IGNPAR matches node-serialport — a byte that
  // fails the parity check is dropped, not delivered as a NUL for the
  // application to mistake for data.
  let iflag = IGNPAR
  if (parity !== 'none') iflag |= INPCK
  if (xon) iflag |= IXON
  if (xoff) iflag |= IXOFF
  if (xany) iflag |= IXANY
  writeFlag(termiosView, off.c_iflag, iflag)

  // Output flags: raw
  writeFlag(termiosView, off.c_oflag, 0)

  // Local flags: raw
  writeFlag(termiosView, off.c_lflag, 0)

  // Special characters: VMIN=1, VTIME=0 (blocking read until at least 1 byte)
  const ccOffset = off.c_cc
  // Clear all cc
  for (let i = 0; i < NCCS; i++) termiosBytes[ccOffset + i] = 0
  termiosBytes[ccOffset + VMIN] = 1
  termiosBytes[ccOffset + VTIME] = 0

  // Set baud rate. Standard rates ride the classic Bxxx table; custom rates
  // apply everything else with a 9600 placeholder first, then switch speed
  // through the platform's custom-rate mechanism after tcsetattr.
  const standard = isStandardBaudRate(baudRate)
  const baudCode = standard ? encodeBaudRate(baudRate) : encodeBaudRate(9600)
  if (IS_LINUX && standard) {
    // Linux: write speed into c_ispeed and c_ospeed fields, and also
    // use cfsetispeed/cfsetospeed for the flag bits
    writeSpeed(termiosView, off.c_ispeed, baudCode)
    writeSpeed(termiosView, off.c_ospeed, baudCode)
  }
  // Use cfsetispeed/cfsetospeed which handles platform differences
  if (libc.symbols.cfsetispeed(termiosPtr, baudCode) < 0) {
    libc.symbols.close(fd)
    throw errnoError('cfsetispeed')
  }
  if (libc.symbols.cfsetospeed(termiosPtr, baudCode) < 0) {
    libc.symbols.close(fd)
    throw errnoError('cfsetospeed')
  }

  // Apply
  if (libc.symbols.tcsetattr(fd, TCSAFLUSH, termiosPtr) < 0) {
    libc.symbols.close(fd)
    throw errnoError('tcsetattr')
  }

  if (!standard) {
    try {
      setCustomBaudRate(fd, baudRate)
    } catch (err) {
      libc.symbols.close(fd)
      throw err
    }
  }

  // Flush any stale data
  libc.symbols.tcflush(fd, TCIOFLUSH)

  return fd
}

export function closePort(fd) {
  if (libc.symbols.close(fd) < 0) throw errnoError('close')
}

const MAX_EAGAIN_RETRIES = 1000

function abortedError() {
  const err = new Error('write aborted: port is closing')
  err.code = 'ABORTED'
  return err
}

// shouldAbort is consulted only when the write would otherwise sleep on a
// full kernel buffer — a healthy write completes, a stuck one can be
// interrupted by close() instead of waiting out the retry cap.
export async function writePort(fd, data, shouldAbort) {
  const buf = toBytes(data)
  let offset = 0
  let eagainCount = 0
  while (offset < buf.length) {
    const slice = buf.subarray(offset)
    const written = Number(libc.symbols.write(fd, ptr(slice), BigInt(slice.length)))
    if (written < 0) {
      const code = getErrno()
      if (code === EINTR) continue // interrupted by a signal — retry, no budget spent
      if (code === EAGAIN) {
        // Kernel buffer full
        if (++eagainCount > MAX_EAGAIN_RETRIES) {
          throw new Error('write: device not accepting data (EAGAIN limit exceeded)')
        }
        if (shouldAbort?.()) throw abortedError()
        await Bun.sleep(1)
        if (shouldAbort?.()) throw abortedError()
        continue
      }
      throw errnoError('write')
    }
    if (written === 0) {
      if (++eagainCount > MAX_EAGAIN_RETRIES) {
        throw new Error('write: device accepted zero bytes repeatedly')
      }
      if (shouldAbort?.()) throw abortedError()
      await Bun.sleep(1)
      continue
    }
    eagainCount = 0
    offset += written
  }
  return offset
}

export function readPort(fd, buffer) {
  // Non-blocking read into the provided buffer
  const n = Number(libc.symbols.read(fd, ptr(buffer), BigInt(buffer.length)))
  if (n < 0) {
    const code = getErrno()
    // EAGAIN: no data available. EINTR: a signal landed mid-read — treating
    // it as fatal turned profiler ticks into phantom disconnects.
    if (code === EAGAIN || code === EINTR) return 0
    throw errnoError('read')
  }
  if (n === 0) {
    const err = new Error('read: device returned EOF')
    err.code = 'EOF'
    err.syscall = 'read'
    throw err
  }
  return n
}

export function updateBaudRate(fd, baudRate) {
  validateBaudRate(baudRate)

  if (!isStandardBaudRate(baudRate)) {
    drainPort(fd) // match TCSADRAIN semantics: let pending output finish first
    setCustomBaudRate(fd, baudRate)
    return
  }

  const termiosBuf = new ArrayBuffer(TERMIOS_SIZE)
  const termiosBytes = new Uint8Array(termiosBuf)
  const termiosPtr = ptr(termiosBytes)

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
  // Unknown keys throw. Silent acceptance is how missing brk support stayed
  // invisible for two releases.
  for (const key of Object.keys(flags)) {
    if (key !== 'dtr' && key !== 'rts' && key !== 'brk') {
      throw new Error(`Invalid set() flag: ${key}`)
    }
  }
  const { dtr, rts, brk } = flags
  const intBuf = new ArrayBuffer(4)
  const intView = new DataView(intBuf)
  const intBytes = new Uint8Array(intBuf)
  const intPtr = ptr(intBytes)

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

  if (brk === true) {
    if (libc.symbols.ioctl(fd, TIOCSBRK, null) < 0) throw errnoError('ioctl TIOCSBRK')
  }
  if (brk === false) {
    if (libc.symbols.ioctl(fd, TIOCCBRK, null) < 0) throw errnoError('ioctl TIOCCBRK')
  }
}

export function getModemLines(fd) {
  const intBuf = new ArrayBuffer(4)
  const intView = new DataView(intBuf)
  const intBytes = new Uint8Array(intBuf)
  const intPtr = ptr(intBytes)

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
  while (libc.symbols.tcdrain(fd) < 0) {
    if (getErrno() !== EINTR) throw errnoError('tcdrain')
  }
}
