# Roadmap

## v0.2.0 — Event-driven reads

The current read loop polls the file descriptor every 1ms with `setInterval`. It works, but it burns CPU checking an empty buffer. The plan is to replace this with proper event-driven I/O once Bun exposes fd-level polling (epoll on Linux, kqueue on macOS). If Bun doesn't add this soon, we'll write a small C shim that does `poll()` on the serial fd and writes a wake byte to a pipe that Bun can watch natively.

## v0.3.0 — Mock binding for testing

A mock serial port that lives entirely in memory. You create a pair of virtual ports — write to one, read from the other. This lets you test serial protocol code in CI without hardware. Inspired by `@serialport/binding-mock` from node-serialport, but adapted to work with our EventEmitter API.

## v0.4.0 — Additional parsers

Parsers commonly needed in robotics and embedded work:

- **Inter-byte timeout** — emits a packet after a silence gap between bytes. Useful for Modbus RTU and similar protocols where message boundaries are defined by timing rather than delimiters.
- **Packet length** — reads a length field from the header and emits exactly that many bytes. Common in binary sensor protocols.
- **SLIP encoder/decoder** — the Serial Line Internet Protocol framing used by some embedded devices and networking stacks.
- **COBS encoder/decoder** — Consistent Overhead Byte Stuffing, a popular framing scheme for binary serial protocols that guarantees a delimiter byte never appears in the payload.

## v0.5.0 — macOS USB metadata

Port enumeration on macOS currently returns device paths but no manufacturer or serial number info. This version will use `ioreg` (or the IOKit framework via FFI) to read USB device metadata, matching what the Linux implementation already provides through sysfs.

## v0.6.0 — Custom baud rates

Some hardware (GPS modules, certain microcontrollers) uses non-standard baud rates like 250000 or 500000. Linux supports this via `BOTHER` and the `termios2` struct. macOS supports arbitrary rates via `iossiospeed` ioctl. This version will add support for any integer baud rate on both platforms.

## Future considerations

**Windows support.** Windows doesn't have POSIX termios — it uses `CreateFile` + `SetCommState` + overlapped I/O. This is a fundamentally different native surface. The binding layer is already isolated enough that a `win32.js` could sit alongside `posix.js`, but it's a significant amount of work and depends on Bun's FFI working well with Win32 APIs.

**Async iterator interface.** A `for await (const chunk of port)` interface could be offered alongside the EventEmitter API for use cases where backpressure matters (logging, file transfer). This would be additive — the EventEmitter stays the primary interface for real-time control.

**Auto-reconnect.** Detect when a USB serial device disconnects and reconnects, then automatically reopen the port. Useful for long-running robotics applications where a loose USB cable shouldn't crash the system.
