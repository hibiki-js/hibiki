import type { IdempotencyStore } from "./idempotency.js"

/** A map from native event names to their parsed payloads. */
export type EventMap = object

export type SupportedParseResult<TEvents extends EventMap> = {
  [K in keyof TEvents & string]: {
    kind: "supported"
    eventName: K
    event: TEvents[K]
    /** A stable ID from authenticated data; used for handler deduplication. */
    id?: string
  }
}[keyof TEvents & string]

export type ParseResult<TEvents extends EventMap> =
  | SupportedParseResult<TEvents>
  | { kind: "unsupported"; nativeEventName: string | undefined; id?: string }

export interface VerifyInput { rawBody: Uint8Array; headers: Headers; request: Request }
export interface ParseInput { rawBody: Uint8Array; text: string; headers: Headers; request: Request }

/** Implement this interface to add a custom webhook provider. */
export interface HibikiProvider<TName extends string, TEvents extends object> {
  readonly name: TName
  /** Restrict accepted media types after signature verification. */
  readonly contentTypes?: readonly string[]
  verify(input: VerifyInput): Promise<void>
  parse(input: ParseInput): Promise<ParseResult<TEvents>>
}

export interface HibikiContext<TEvent = unknown, TProvider extends string = string> {
  event: TEvent
  provider: TProvider
  request: Request
  headers: Headers
  rawBody: string
  id?: string
  waitUntil?: (promise: Promise<unknown>) => void
}

export type AnyProvider = {
  readonly name: string
  readonly contentTypes?: readonly string[]
  verify(input: VerifyInput): Promise<void>
  parse(input: ParseInput): Promise<unknown>
}
export type ProviderRegistry = Record<string, AnyProvider>
export type Registry = ProviderRegistry
export type ProviderName<R extends Registry> = keyof R & string
type EventsOf<P> = P extends HibikiProvider<string, infer E> ? E : never
export type RegisteredEventName<R extends Registry> = {
  [P in ProviderName<R>]: `${P}.${keyof EventsOf<R[P]> & string}`
}[ProviderName<R>]
export type ContextFor<R extends Registry, N extends RegisteredEventName<R>> =
  N extends `${infer P}.${infer E}`
    ? P extends ProviderName<R>
      ? E extends keyof EventsOf<R[P]>
        ? HibikiContext<EventsOf<R[P]>[E], P>
        : never : never : never
/** Parsed payload for one event supported by the registered providers. */
export type RegisteredEventPayload<R extends Registry, N extends RegisteredEventName<R>> = ContextFor<R, N>["event"]
export type Middleware = (context: HibikiContext, next: () => Promise<void>) => Promise<void> | void
export type Handler = (context: HibikiContext) => Promise<Response | void> | Response | void

export interface HibikiOptions {
  strictEvents?: boolean
  /** Maximum raw body bytes, checked before verification. Defaults to 1 MiB. */
  maxBodyBytes?: number
  /** Defaults to a bounded, process-local store. Use a shared store in production. */
  idempotencyStore?: IdempotencyStore
}
export interface HandleOptions<R extends Registry> {
  provider: ProviderName<R>
  waitUntil?: (promise: Promise<unknown>) => void
}

export type HibikiErrorCode =
  | "HIBIKI_VERIFICATION_FAILED" | "HIBIKI_PARSE_FAILED" | "HIBIKI_UNSUPPORTED_EVENT"
  | "HIBIKI_UNSUPPORTED_CONTENT_TYPE" | "HIBIKI_PROVIDER_NOT_REGISTERED"
  | "HIBIKI_DUPLICATE_HANDLER" | "HIBIKI_HANDLER_FAILED"
  | "HIBIKI_PAYLOAD_TOO_LARGE" | "HIBIKI_EVENT_IN_PROGRESS" | "HIBIKI_IDEMPOTENCY_UNAVAILABLE"
