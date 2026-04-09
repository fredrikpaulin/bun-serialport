# bun-serialport API

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
  autoOpen: true,           // open immediately (default: true)
  readBufferSize: 65536,    // read buffer size in bytes (default: 65536)
})
```

When `autoOpen` is `true` (default), the port opens on the next microtask. Attach event listeners before awaiting any async operations.

### Properties

- `port.path` — device path (read-only)
- `port.baudRate` — current baud rate (read-only)
- `port.isOpen` — `true` when open and not closing

### Methods

All methods return Promises.

- `port.open()` — open the port (only needed if `autoOpen: false`)
- `port.close()` — close the port
- `port.write(data)` — write `Uint8Array`, `Buffer`, or `string` (UTF-8 encoded)
- `port.update({ baudRate })` — change baud rate on an open port
- `port.set({ dtr, rts })` — set modem control lines (`true`/`false`)
- `port.get()` — returns `{ cts, dsr, dcd, ri }` modem status booleans
- `port.flush()` — discard buffered I/O data
- `port.drain()` — wait for all output to be transmitted
- `port.pipe(parser)` — wire a parser to receive data events, returns the parser

### Events

- `'open'` — port opened successfully
- `'data'` — data received (`Uint8Array`)
- `'error'` — error occurred (has `.disconnected` property if unexpected disconnect)
- `'close'` — port closed

## list()

```js
import { list } from 'bun-serialport'

const ports = await list()
// [{ path: '/dev/ttyUSB0', manufacturer: '...', vendorId: '...', productId: '...', serialNumber: '...', product: '...' }]
```

Returns available serial ports. On Linux, reads USB metadata from sysfs. On macOS, scans `/dev` for `cu.*` and `tty.*` devices.

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
