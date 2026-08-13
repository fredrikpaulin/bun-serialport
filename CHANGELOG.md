# Changelog

## Unreleased

### Added
- Arbitrary baud rates. Rates outside the classic POSIX table (250000, 74880, 31250, ...) now work via `termios2`/`BOTHER` on Linux and `IOSSIOSPEED` on macOS. Legacy rates 50–1800 added to the standard table (#007, #008).
- `set({ brk })` asserts/clears the break signal via TIOCSBRK/TIOCCBRK — needed by LIN, DMX512, and several bootloaders (#006).
- `xany` option: any received character restarts XOFF-stopped output (#013).
- `lock` option (default `true`): exclusive port access via `flock(LOCK_EX | LOCK_NB)`. A second open of a locked port fails fast with a clear error instead of silently sharing the byte stream (#003).

- `list()` on Linux includes `pnpId` (the `/dev/serial/by-id` name) and `locationId` (sysfs USB devpath) for stable device identity across replugs (#012).

### Improved
- docs: the blocking behavior of `drain()`/`update()` under stalled hardware flow control is documented in the overview, with the async-FFI revisit noted in the roadmap (#011).

### Fixed
- Bytes failing the parity check are dropped (IGNPAR) instead of delivered as NUL (#005).
- `set()` throws on unknown flags instead of silently ignoring them (#006).
- The `close` event carries the originating error after a disconnect, so listeners can tell a vanished device from a deliberate close (#010).
- Boolean options (`rtscts`, `xon`, `xoff`, `xany`, `hupcl`, `lock`, `autoOpen`) are validated before opening hardware (#015).
- Writes are chained: concurrent `write()` calls no longer interleave under backpressure, `drain()` waits for bytes still in the JS retry loop, and `close()` waits for in-flight writes — a writer stuck on a full kernel buffer is interrupted instead of racing the fd close (#001).
- EINTR is retried instead of treated as fatal in `read`, `write`, and `tcdrain` paths. A signal landing mid-read no longer produces a phantom disconnect (#002).
- EAGAIN detection is platform-correct: 11 on Linux, 35 on macOS, instead of accepting both values on both platforms (#009).
- The port fd is opened with O_CLOEXEC — spawned children no longer inherit it, so a subprocess can't silently hold the port (and its lock, and DTR) after the parent closes (#004).

### Removed
- The `fcntl` FFI symbol and F_GETFL/F_SETFL constants, declared since v0.1.0 and never called (#014).

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
