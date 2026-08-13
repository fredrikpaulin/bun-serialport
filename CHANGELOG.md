# Changelog

## 0.2.0 — 2026-08-13

Write-then-close no longer loses data, plus the accumulated lifecycle, validation, and parser fixes from the May audit.

### Added
- `hupcl` option (default `true`, matching node-serialport). Pass `hupcl: false` to keep DTR asserted when the port closes — devices that auto-reset on a DTR edge (most Arduino/ESP dev boards) otherwise reboot on close.

### Fixed
- `close()` now drains pending output (`tcdrain`) before closing the fd. `write()` resolves when the kernel accepts the bytes, not when they are transmitted, so an immediate close could discard buffered output on real hardware.
- `SerialPort` now waits for a pending auto-open before writes and other open-only operations run.
- `update({ baudRate })` now keeps the stored options in sync, so close/reopen uses the updated baud rate.
- Zero-byte reads are treated as EOF/disconnect instead of "no data yet".
- Unsupported baud rates, invalid parity, invalid stop bits, and invalid read buffer settings now fail before opening hardware.
- Empty delimiters now throw instead of hanging the parser. Consecutive delimiters now emit empty messages, preserving blank lines.
- Async rejection tests now await the Promise assertions.

### Improved
- `writePort()` yields between EAGAIN retries instead of spinning synchronously.
- String writes and FFI path encoding use `TextEncoder` instead of `Buffer.from()`.
- `byteLengthParser` compacts its buffer once per push instead of once per emitted frame.
- Published package contents now include linked docs and the changelog.

## 0.1.1 — 2026-04-13

Codebase sweep: bug fixes, performance, and Bun optimization.

### Fixed
- writePort EAGAIN busy-spin: added retry cap (1000) to prevent infinite CPU burn when device stops accepting data
- Removed redundant Uint8Array allocation in openPort termios pointer handling (GC-safe single pointer now)
- Cleaned unused FFI imports (toBuffer, and ~15 unused constant imports in posix.js)
- macOS port dedup in list() now actually implemented (was a comment-only promise)
- readlineParser now wraps `once()` and `removeListener` in addition to `on`/`off`

### Improved
- Parser buffers use growing pre-allocated arrays with copyWithin() instead of allocating new Uint8Array on every push() — significantly reduces GC pressure on hot data paths
- list.js: port enumeration and USB metadata reads parallelized with Promise.all instead of sequential awaits
- list.js: uses Bun.file().text() instead of node:fs/promises readFile
- Read loop data copy simplified: buf.slice(0, n) instead of constructing a view then slicing
- Read poll interval now configurable via `readInterval` option (default 1ms)
- Added pipe()/unpipe() support to detach parsers without leaking listeners

## 0.1.0 — 2026-04-10

Initial implementation.

- SerialPort class with EventEmitter API (open, close, write, data events)
- POSIX termios FFI bindings via `bun:ffi` (no native compilation)
- Platform support: macOS (Darwin) and Linux
- Port enumeration (`list()`) with USB metadata on Linux
- Parsers: delimiter, byte-length, readline
- Full baud rate support including high-speed rates (up to 4M on Linux)
- Modem control lines (DTR, RTS, CTS, DSR, DCD, RI)
- Hardware and software flow control
