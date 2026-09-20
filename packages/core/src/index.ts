/** A map from native event names to their parsed payloads. */
export type EventMap = object

export type SupportedParseResult<TEvents extends EventMap> = {
  [K in keyof TEvents & string]: {
    kind: "supported"
    eventName: K
    event: TEvents[K]
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

export function defineProvider<TName extends string, TEvents extends object>(
  provider: HibikiProvider<TName, TEvents>,
): HibikiProvider<TName, TEvents> { return provider }

export type HibikiErrorCode =
  | "HIBIKI_VERIFICATION_FAILED" | "HIBIKI_PARSE_FAILED" | "HIBIKI_UNSUPPORTED_EVENT"
  | "HIBIKI_UNSUPPORTED_CONTENT_TYPE" | "HIBIKI_PROVIDER_NOT_REGISTERED"
  | "HIBIKI_DUPLICATE_HANDLER" | "HIBIKI_HANDLER_FAILED"

/** A stable, safe-to-inspect error raised by Hibiki. */
export class HibikiError extends Error {
  constructor(readonly code: HibikiErrorCode, message: string, readonly status: number) {
    super(message); this.name = "HibikiError"
  }
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

type AnyProvider = {
  readonly name: string
  readonly contentTypes?: readonly string[]
  verify(input: VerifyInput): Promise<void>
  parse(input: ParseInput): Promise<unknown>
}
export type ProviderRegistry = Record<string, AnyProvider>
type Registry = ProviderRegistry
type ProviderName<R extends Registry> = keyof R & string
type EventsOf<P> = P extends HibikiProvider<string, infer E> ? E : never
export type RegisteredEventName<R extends Registry> = {
  [P in ProviderName<R>]: `${P}.${keyof EventsOf<R[P]> & string}`
}[ProviderName<R>]
type ContextFor<R extends Registry, N extends RegisteredEventName<R>> =
  N extends `${infer P}.${infer E}`
    ? P extends ProviderName<R>
      ? E extends keyof EventsOf<R[P]>
        ? HibikiContext<EventsOf<R[P]>[E], P>
        : never : never : never
type Middleware = (context: HibikiContext, next: () => Promise<void>) => Promise<void> | void
type Handler = (context: HibikiContext) => Promise<Response | void> | Response | void

export interface HibikiOptions { strictEvents?: boolean }
export interface HandleOptions<R extends Registry> {
  provider: ProviderName<R>
  waitUntil?: (promise: Promise<unknown>) => void
}

const decoder = new TextDecoder()
const RESPONSE_UNSUPPORTED = new Response(null, { status: 200 })
const RESPONSE_NO_CONTENT = new Response(null, { status: 204 })
const RESPONSE_INTERNAL = new Response("Internal webhook error", { status: 500 })

/** Immutable, type-state webhook application builder. */
export class Hibiki<R extends Registry = {}> {
  private readonly providers: Map<string, AnyProvider>
  private readonly handlers: Map<string, Handler>
  private middlewares: readonly Middleware[]
  private readonly options: HibikiOptions

  constructor(options: HibikiOptions = {}, state?: {
    providers: Map<string, AnyProvider>; handlers: Map<string, Handler>; middlewares: readonly Middleware[]
  }) {
    this.options = options
    this.providers = state?.providers ?? new Map()
    this.handlers = state?.handlers ?? new Map()
    this.middlewares = state?.middlewares ?? []
  }

  /** Return a new builder with this provider added; the original builder is unchanged. */
  use<P extends AnyProvider>(
    provider: P & (P["name"] extends ProviderName<R> ? never : unknown),
  ): Hibiki<R & Record<P["name"], P>> {
    if (this.providers.has(provider.name)) throw new HibikiError("HIBIKI_PROVIDER_NOT_REGISTERED", "Provider is already registered", 500)
    const providers = new Map(this.providers)
    providers.set(provider.name, provider)
    return new Hibiki<R & Record<P["name"], P>>(this.options, { providers, handlers: new Map(this.handlers), middlewares: this.middlewares })
  }

  /** Register exactly one handler for a supported provider event. */
  on<N extends RegisteredEventName<R>>(eventName: N, handler: (context: ContextFor<R, N>) => Promise<Response | void> | Response | void): this {
    if (this.handlers.has(eventName)) throw new HibikiError("HIBIKI_DUPLICATE_HANDLER", "Handler is already registered", 500)
    this.handlers.set(eventName, handler as Handler)
    return this
  }

  /** Add middleware that wraps execution of a registered handler. */
  useMiddleware(middleware: Middleware): this { this.middlewares = [...this.middlewares, middleware]; return this }

  /** Verify, parse, route, and handle a webhook request. */
  async handle(request: Request, options: HandleOptions<R>): Promise<Response> {
    try {
      const provider = this.providers.get(options.provider)
      if (!provider) throw new HibikiError("HIBIKI_PROVIDER_NOT_REGISTERED", "Provider is not registered", 500)
      const rawBody = new Uint8Array(await request.clone().arrayBuffer())
      await provider.verify({ rawBody, headers: request.headers, request })
      const contentTypeHeader = request.headers.get("content-type")
      if (provider.contentTypes) {
        const contentType = contentTypeHeader?.split(";", 1)[0]?.trim().toLowerCase()
        if (!contentType || !provider.contentTypes.includes(contentType)) {
          throw new HibikiError("HIBIKI_UNSUPPORTED_CONTENT_TYPE", "Unsupported content type", 415)
        }
      }
      const text = decoder.decode(rawBody)
      let parsed: { kind: "supported"; eventName: string; event: unknown; id?: string } | { kind: "unsupported"; nativeEventName: string | undefined; id?: string }
      try { parsed = await provider.parse({ rawBody, text, headers: request.headers, request }) as typeof parsed }
      catch (error) { if (error instanceof HibikiError) throw error; throw new HibikiError("HIBIKI_PARSE_FAILED", "Webhook payload could not be parsed", 400) }
      if (parsed.kind === "unsupported") {
        if (this.options.strictEvents) throw new HibikiError("HIBIKI_UNSUPPORTED_EVENT", "Unsupported event", 400)
        return RESPONSE_UNSUPPORTED
      }
      const handler = this.handlers.get(`${provider.name}.${parsed.eventName}`)
      if (!handler) return RESPONSE_NO_CONTENT
      const context: HibikiContext = {
        event: parsed.event,
        provider: provider.name,
        request,
        headers: request.headers,
        rawBody: text,
        ...(parsed.id ? { id: parsed.id } : {}),
        ...(options.waitUntil ? { waitUntil: options.waitUntil } : {}),
      }
      let result: Response | void = undefined
      try {
        if (this.middlewares.length === 0) result = await handler(context)
        else {
          const middlewares = this.middlewares
          let index = 0
          const dispatch = async (): Promise<void> => {
            const middleware = middlewares[index++]
            if (middleware) await middleware(context, dispatch)
            else result = await handler(context)
          }
          await dispatch()
        }
      } catch { throw new HibikiError("HIBIKI_HANDLER_FAILED", "Webhook handler failed", 500) }
      return result instanceof Response ? result : RESPONSE_NO_CONTENT
    } catch (error) {
      if (error instanceof HibikiError) return new Response(error.code, { status: error.status })
      return RESPONSE_INTERNAL
    }
  }
}
