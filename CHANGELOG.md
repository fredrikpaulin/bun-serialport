# Changelog

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
