// Type declarations for the parsers. Standalone by design — see
// ../index.d.ts for the rationale.

export interface DelimiterParserOptions {
  /** Byte, string, or array of bytes (default: 0x0a). Must not be empty. */
  delimiter?: number | string | ArrayLike<number>
  /** Include the delimiter in emitted messages (default: false). */
  includeDelimiter?: boolean
}

export interface ByteLengthParserOptions {
  /** Emitted chunk size in bytes (default: 1). Must be >= 1. */
  length?: number
}

export interface ReadlineParserOptions {
  /** Line delimiter (default: '\n'). */
  delimiter?: string
  /** TextDecoder encoding (default: 'utf-8'). */
  encoding?: string
}

/** Parser emitting Uint8Array messages. */
export interface ByteParser {
  push(chunk: Uint8Array): void
  on(event: 'data', listener: (data: Uint8Array) => void): this
  once(event: 'data', listener: (data: Uint8Array) => void): this
  off(event: 'data', listener: (data: Uint8Array) => void): this
}

/** Parser emitting decoded strings. */
export interface LineParser {
  push(chunk: Uint8Array): void
  on(event: 'data', listener: (line: string) => void): this
  once(event: 'data', listener: (line: string) => void): this
  off(event: 'data', listener: (line: string) => void): this
}

/** Split incoming data on a delimiter; emits messages without it by default. */
export declare function delimiterParser(options?: DelimiterParserOptions): ByteParser

/** Emit chunks of exactly `length` bytes. */
export declare function byteLengthParser(options?: ByteLengthParserOptions): ByteParser

/** Like delimiterParser, but emits decoded strings. */
export declare function readlineParser(options?: ReadlineParserOptions): LineParser
