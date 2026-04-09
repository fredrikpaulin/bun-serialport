# bun-serialport

Bun-native serial port library for robotics and sensors. Uses `bun:ffi` to call POSIX termios directly — no native compilation, no node-gyp, no binary downloads. Just `bun install` and go.

## Install

```sh
bun install bun-serialport
```

## Quick start

```js
import { SerialPort, readlineParser } from 'bun-serialport'

const port = new SerialPort({ path: '/dev/ttyUSB0', baudRate: 115200 })
const lines = port.pipe(readlineParser())

lines.on('data', (line) => {
  console.log('received:', line)
})

await port.write('HELLO\n')
```

## List available ports

```js
import { list } from 'bun-serialport'

const ports = await list()
for (const p of ports) {
  console.log(p.path, p.manufacturer || '')
}
```

## Why not node-serialport?

node-serialport is excellent, but it carries baggage that doesn't fit a Bun-first workflow: a C++ addon compiled via node-gyp, Node.js Duplex stream abstractions, and 18 packages in a monorepo. bun-serialport takes a different approach:

- **Zero compilation.** `bun:ffi` calls libc directly. No build toolchain required.
- **EventEmitter, not streams.** Data events fire immediately when bytes arrive. No highWaterMark tuning, no backpressure complexity. Better for real-time hardware control.
- **Single package.** One import, no dependency tree.

## Platforms

macOS and Linux. Both use POSIX termios — the FFI layer is nearly identical across them.

## Documentation

- [Overview](docs/overview.md) — how the library works, layer breakdown, and platform details
- [API reference](docs/api.md) — full constructor options, methods, events, and parsers
- [Roadmap](docs/roadmap.md) — what's coming in future versions
- [Changelog](CHANGELOG.md)

## License

MIT
