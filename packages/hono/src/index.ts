import type { MiddlewareHandler } from "hono"
import type { Hibiki, ProviderRegistry, RegisteredEventName } from "@hibiki/core"

/** Adapt a Hibiki application to a Hono route for one registered provider. */
export function hibiki<R extends ProviderRegistry>(app: Hibiki<R>, provider: Parameters<Hibiki<R>["handle"]>[1]["provider"]): MiddlewareHandler {
  return async (context) => app.handle(context.req.raw, { provider })
}

export type { RegisteredEventName }
