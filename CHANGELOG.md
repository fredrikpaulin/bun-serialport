# Changelog

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
