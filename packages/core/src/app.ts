import { readBody } from "./body.js"
import { createMemoryIdempotencyStore, type IdempotencyStore } from "./idempotency.js"
import { HibikiError } from "./errors.js"
import type {
  AnyProvider, Registry, ProviderName, RegisteredEventName, ContextFor,
  Middleware, Handler, HibikiOptions, HandleOptions, HibikiContext, ParseResult,
} from "./types.js"

const decoder = /* @__PURE__ */ new TextDecoder()

/** Immutable, type-state webhook application builder. */
export class Hibiki<R extends Registry = {}> {
  private readonly providers: Map<string, AnyProvider>
  private readonly handlers: Map<string, Handler>
  private middlewares: readonly Middleware[]
  private readonly options: HibikiOptions
  private readonly idempotencyStore: IdempotencyStore

  /** Create an application with bounded ingress and a store shared by its builders. */
  constructor(options: HibikiOptions = {}, state?: {
    providers: Map<string, AnyProvider>
    handlers: Map<string, Handler>
    middlewares: readonly Middleware[]
  }) {
    const maxBodyBytes = options.maxBodyBytes ?? 1_048_576
    if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) throw new TypeError("maxBodyBytes must be a positive safe integer")
    this.idempotencyStore = options.idempotencyStore ?? createMemoryIdempotencyStore()
    this.options = { ...options, maxBodyBytes, idempotencyStore: this.idempotencyStore }
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
  useMiddleware(middleware: Middleware): this {
    this.middlewares = [...this.middlewares, middleware]
    return this
  }

  /** Verify, parse, route, and handle a webhook request. */
  async handle(request: Request, options: HandleOptions<R>): Promise<Response> {
    let claim: { key: string; token: string } | undefined
    try {
      const provider = this.providers.get(options.provider)
      if (!provider) return new Response("HIBIKI_PROVIDER_NOT_REGISTERED", { status: 500 })
      const rawBody = await readBody(request, this.options.maxBodyBytes!)
      await provider.verify({ rawBody, headers: request.headers, request })
      const contentTypeHeader = request.headers.get("content-type")
      if (provider.contentTypes) {
        const contentType = contentTypeHeader?.split(";", 1)[0]?.trim().toLowerCase()
        if (!contentType || !provider.contentTypes.includes(contentType)) {
          return new Response("HIBIKI_UNSUPPORTED_CONTENT_TYPE", { status: 415 })
        }
      }
      const text = decoder.decode(rawBody)
      let parsed: ParseResult<Record<string, unknown>>
      try {
        parsed = await provider.parse({ rawBody, text, headers: request.headers, request }) as typeof parsed
      } catch (error) {
        if (error instanceof HibikiError) throw error
        return new Response("HIBIKI_PARSE_FAILED", { status: 400 })
      }
      if (parsed.kind === "unsupported") {
        if (this.options.strictEvents) return new Response("HIBIKI_UNSUPPORTED_EVENT", { status: 400 })
        return new Response(null, { status: 200 })
      }
      const handler = this.handlers.get(`${provider.name}.${parsed.eventName}`)
      if (!handler) return new Response(null, { status: 204 })
      if (parsed.id) {
        // IDs must originate from signed payloads, never unsigned delivery headers.
        const key = JSON.stringify([provider.name, parsed.id])
        let acquired
        try { acquired = await this.idempotencyStore.claim(key) }
        catch { return new Response("HIBIKI_IDEMPOTENCY_UNAVAILABLE", { status: 503 }) }
        if (acquired.status === "completed") return new Response(null, { status: 204 })
        if (acquired.status === "pending") return new Response("HIBIKI_EVENT_IN_PROGRESS", { status: 503 })
        claim = { key, token: acquired.token }
      }
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
      } catch {
        throw new HibikiError("HIBIKI_HANDLER_FAILED", "Webhook handler failed", 500)
      }
      const response = result instanceof Response ? result : new Response(null, { status: 204 })
      if (claim) {
        const owned = claim
        // After handler success, a completion failure must keep the claim pending.
        // Releasing it here could repeat already committed side effects.
        claim = undefined
        try {
          if (response.ok) await this.idempotencyStore.complete(owned.key, owned.token)
          else await this.idempotencyStore.release(owned.key, owned.token)
        } catch { return new Response("HIBIKI_IDEMPOTENCY_UNAVAILABLE", { status: 503 }) }
      }
      return response
    } catch (error) {
      if (claim) {
        try { await this.idempotencyStore.release(claim.key, claim.token) }
        catch { return new Response("HIBIKI_IDEMPOTENCY_UNAVAILABLE", { status: 503 }) }
      }
      if (error instanceof HibikiError) return new Response(error.code, { status: error.status })
      return new Response("Internal webhook error", { status: 500 })
    }
  }
}
