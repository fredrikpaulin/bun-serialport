# How bun-serialport works

bun-serialport talks to serial hardware through the same POSIX interface the operating system uses — `termios` for configuration, `read`/`write` for data, `ioctl` for modem control lines. The difference from other serial libraries is that there's no C++ in the middle. Bun's FFI opens `libc` directly and calls the syscalls from JavaScript.

## What happens when you open a port

```js
const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 115200 })
```

Under the hood this does roughly what you'd do in C: opens the device file with `O_RDWR | O_NOCTTY | O_NONBLOCK`, gets the current termios struct with `tcgetattr`, configures it for raw mode at the requested baud rate, and applies it with `tcsetattr`. The port is then ready for I/O.

Once open, a read loop polls the file descriptor every 1ms for incoming data. When bytes arrive they're emitted as a `Uint8Array` on the `'data'` event. Writes go straight to the OS — `port.write()` resolves once the kernel accepts the bytes.

## Layers

The library has three layers:

**FFI bindings** (`src/bindings/`) handle the raw syscalls. This is where termios structs get packed and unpacked, baud rates get encoded (Linux uses lookup codes, macOS uses the literal value), and platform differences get absorbed. You shouldn't need to touch this layer.

**SerialPort** (`src/serialport.js`) is an EventEmitter that owns the file descriptor and the read loop. It exposes the methods you'd expect: `open`, `close`, `write`, `update`, `set`, `get`, `flush`, `drain`. All return Promises.

**Parsers** (`src/parsers/`) are small EventEmitters that split raw byte streams into messages. Plug them in with `port.pipe(parser)` and listen for `'data'` events on the parser. They're intentionally simple — the delimiter parser is about 40 lines.

## Platforms

macOS and Linux are supported. Both use POSIX termios, so the same code path handles both — the differences are limited to struct sizes, baud rate encoding, and a handful of ioctl constants. A platform constants file handles the branching at import time.

## Data format

All data flows as `Uint8Array`. This is the natural format for binary protocols common in robotics and sensor work. If you're working with text, the `readlineParser` decodes to strings for you.

Writes accept `Uint8Array`, `Buffer`, or plain strings (UTF-8 encoded automatically).

## Error handling

Async methods reject on failure. If a device disconnects unexpectedly, the port emits an `'error'` event with `err.disconnected = true`, followed by `'close'`. Common error scenarios: `ENOENT` if the device path doesn't exist, `EACCES` if you don't have permission (you may need to add your user to the `dialout` group on Linux).

## Dependencies

None. The library uses `bun:ffi` and Bun built-ins exclusively. No native addons, no npm dependencies.
