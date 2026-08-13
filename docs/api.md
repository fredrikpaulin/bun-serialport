# bun-serialport API

TypeScript types ship with the package — no `@types/` install needed. The
declarations are hand-authored (`src/index.d.ts`) and cover the full surface
below, including typed event payloads. `bun run typecheck` verifies them
against a typed consumer fixture.

## SerialPort

```js
import { SerialPort } from 'bun-serialport'
```

### Constructor

```js
const port = new SerialPort({
  path: '/dev/ttyUSB0',    // required
  baudRate: 115200,         // required
  dataBits: 8,              // 5, 6, 7, 8 (default: 8)
  stopBits: 1,              // 1, 2 (default: 1)
  parity: 'none',           // 'none', 'even', 'odd' (default: 'none')
  rtscts: false,            // hardware flow control (default: false)
  xon: false,               // software flow control (default: false)
  xoff: false,              // software flow control (default: false)
  xany: false,              // any character restarts XOFF-stopped output (default: false)
  hupcl: true,              // drop DTR/RTS on close (default: true)
  lock: true,               // exclusive access via flock (default: true)
  autoOpen: true,           // open immediately (default: true)
  readBufferSize: 65536,    // read buffer size in bytes (default: 65536)
  readInterval: 1,           // read poll interval in ms (default: 1)
})
```

When `autoOpen` is `true` (default), the port opens on the next microtask. Attach event listeners before awaiting any async operations. Methods that need an open port wait for the pending open attempt before running.

Any positive integer baud rate is accepted. Standard rates (`50`–`4000000`, the classic POSIX table) go through termios directly; anything else — `250000` for DMX512/RepRap, `74880` for the ESP8266 boot log, `31250` for MIDI — uses the platform's custom-rate mechanism (`termios2`/`BOTHER` on Linux, `IOSSIOSPEED` on macOS). Whether a custom rate actually works depends on the adapter; FTDI and CH340 handle the common ones.

### Properties

- `port.path` — device path (read-only)
- `port.baudRate` — current baud rate (read-only)
- `port.isOpen` — `true` when open and not closing

### Methods

All methods return Promises.

- `port.open()` — open the port (only needed if `autoOpen: false`)
- `port.close()` — drain pending output, then close the port
- `port.write(data)` — write `Uint8Array`, `ArrayBuffer`, an array of bytes, or `string` (UTF-8 encoded)
- `port.update({ baudRate })` — change baud rate on an open port
- `port.set({ dtr, rts, brk })` — set modem control lines and the break signal (`true`/`false`). Unknown flags throw.
- `port.get()` — returns `{ cts, dsr, dcd, ri }` modem status booleans
- `port.flush()` — discard buffered I/O data
- `port.drain()` — wait for all output to be transmitted
- `port.pipe(parser)` — wire a parser to receive data events, returns the parser

Note: `write()` resolves when the OS accepts the bytes, not when they have
left the wire. `close()` drains pending output before closing so a
write-then-close sequence is safe. If your device resets when DTR drops
(most Arduino/ESP dev boards auto-reset on a DTR edge), open the port with
`hupcl: false` so closing does not reboot it.

`lock: true` (the default) takes an exclusive `flock` on the port, so a second
process opening the same device fails fast instead of silently splitting the
byte stream with you. It only guards against other flock users — which in
practice means other bun-serialport and node-serialport processes. Pass
`lock: false` to opt out.

The port is opened close-on-exec: child processes spawned while the port is
open do not inherit it.

With `parity: 'even'` or `'odd'`, a byte that fails the parity check is
dropped (IGNPAR), matching node-serialport — your parser resynchronizes at
the next message instead of ingesting a stray NUL.

### Events

- `'open'` — port opened successfully
- `'data'` — data received (`Uint8Array`)
- `'error'` — error occurred (has `.disconnected` property if unexpected disconnect)
- `'close'` — port closed. If the close was caused by a disconnect, the listener receives the originating error (with `.disconnected: true`); a deliberate `close()` emits with no argument.

## list()

```js
import { list } from 'bun-serialport'

const ports = await list()
// [{ path: '/dev/ttyUSB0', manufacturer: '...', vendorId: '...', productId: '...',
//    serialNumber: '...', product: '...', pnpId: 'usb-FTDI_FT232R_...-if00-port0', locationId: '1-1.4' }]
```

Returns available serial ports. On Linux, reads USB metadata from sysfs: `pnpId` is the `/dev/serial/by-id` name (stable across replugs), `locationId` is the sysfs USB devpath (stable per physical port). On macOS, scans `/dev` for `cu.*` and `tty.*` devices — USB metadata on macOS is on the roadmap (IOKit).

## Parsers

```js
import { delimiterParser, byteLengthParser, readlineParser } from 'bun-serialport'
```

All parsers are EventEmitters with a `.push(chunk)` method. They emit `'data'` events with parsed messages.

### delimiterParser

```js
const parser = delimiterParser({
  delimiter: '\n',          // byte, string, or array of bytes
  includeDelimiter: false,  // include delimiter in output (default: false)
})
```

### byteLengthParser

```js
const parser = byteLengthParser({ length: 8 })
```

Emits chunks of exactly `length` bytes.

### readlineParser

```js
const parser = readlineParser({
  delimiter: '\n',   // default: '\n'
  encoding: 'utf-8', // default: 'utf-8'
})
```

Like `delimiterParser` but emits decoded strings.

### Using parsers

```js
const parser = port.pipe(readlineParser())
parser.on('data', (line) => console.log(line))
```
