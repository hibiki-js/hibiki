# `@hibiki-js/core`

Core package for Hibiki. It owns the immutable app builder, the provider contract, request routing, and stable error codes. Provider packages (`@hibiki-js/stripe`, `@hibiki-js/github`, …) plug into this API.

Hibiki works with Web Standards `Request` / `Response` only. It does not read environment variables, log payloads, queue deliveries, or retry webhooks.

## Install

```bash
pnpm add @hibiki-js/core
```

Node.js 22+ or any runtime with Web Crypto and `Request` / `Response` (Cloudflare Workers, Deno, Bun, …).

## Quick example

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki()
  .use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))

app.on("stripe.invoice.paid", async ({ event }) => {
  console.log(event.data.object.id)
})

export async function POST(request: Request) {
  return app.handle(request, { provider: "stripe" })
}
```

## `Hibiki`

```ts
import { Hibiki } from "@hibiki-js/core"

const app = new Hibiki(options?)
```

`Hibiki` is an immutable type-state builder. `use()` returns a **new** instance; the previous one is unchanged. After providers are registered, `on()` only accepts event names that exist on those providers.

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `strictEvents` | `boolean` | `false` | When `true`, unsupported provider events return `400` with `HIBIKI_UNSUPPORTED_EVENT` instead of `200` |

### `use(provider)`

Registers a provider and returns a new `Hibiki` with an updated type registry.

```ts
const app = new Hibiki()
  .use(stripe({ secret }))
  .use(github({ secret: githubSecret }))
```

- Throws `HIBIKI_PROVIDER_NOT_REGISTERED` (status `500`) if the same `provider.name` is registered twice
- Does not mutate the previous builder

### `on(eventName, handler)`

Registers exactly one handler for a typed event such as `stripe.invoice.paid` or `github.pull_request.opened`.

```ts
app.on("stripe.checkout.session.completed", async (context) => {
  // context.event is narrowed to that Stripe payload
  console.log(context.event.data.object.id)
})
```

Handler signature:

```ts
(context: HibikiContext) => Promise<Response | void> | Response | void
```

- Returns `this` so you can chain registrations
- Throws `HIBIKI_DUPLICATE_HANDLER` (status `500`) if the event already has a handler
- If the handler returns a `Response`, that response is sent as-is
- If it returns `void` / `undefined`, Hibiki responds with `204`

### `useMiddleware(middleware)`

Adds middleware that wraps **registered handler** execution only. It does not run for signature failures, unsupported content types, parse errors, or unsupported events.

```ts
app.useMiddleware(async (context, next) => {
  const start = performance.now()
  await next()
  console.log(context.provider, context.id, performance.now() - start)
})
```

Signature:

```ts
(context: HibikiContext, next: () => Promise<void>) => Promise<void> | void
```

Middleware runs in registration order. Always `await next()` unless you intentionally short-circuit (Hibiki still expects the handler path to complete for a normal response).

### `handle(request, options)`

Verifies, parses, and routes one webhook `Request`, then returns a `Response`.

```ts
await app.handle(request, {
  provider: "stripe",
  waitUntil?: (promise: Promise<unknown>) => void,
})
```

| Option | Required | Description |
| --- | --- | --- |
| `provider` | yes | Registered provider name (`"stripe"`, `"github"`, …) |
| `waitUntil` | no | Optional background scheduler (for example Cloudflare Workers `ctx.waitUntil`). Forwarded onto `HibikiContext` when set |

Pipeline for every call:

1. Resolve the named provider
2. Read raw body bytes from a cloned `Request`
3. `provider.verify(...)`
4. Enforce `contentTypes` when the provider defines them
5. `provider.parse(...)`
6. Route to the matching handler (with middleware), or return early for unsupported / unhandled events

## Default HTTP responses

| Situation | Status | Body |
| --- | --- | --- |
| Supported event, handler returns void | `204` | empty |
| Supported event, no handler registered | `204` | empty |
| Unsupported provider event (`strictEvents: false`) | `200` | empty |
| Unsupported provider event (`strictEvents: true`) | `400` | `HIBIKI_UNSUPPORTED_EVENT` |
| Handler returns a `Response` | that status | that body |
| `HibikiError` thrown | `error.status` | `error.code` (plain text) |
| Unexpected non-`HibikiError` throw | `500` | `Internal webhook error` |

`200` for unsupported events is intentional: it stops providers such as Stripe / GitHub from retrying forever for event types you have not curated yet.

## `HibikiContext`

Passed to every handler and middleware.

| Field | Type | Description |
| --- | --- | --- |
| `event` | typed payload | Parsed provider event for this handler |
| `provider` | `string` | Provider name (`"stripe"`, …) |
| `request` | `Request` | Original request object |
| `headers` | `Headers` | Same as `request.headers` |
| `rawBody` | `string` | Decoded UTF-8 body text used for parsing |
| `id` | `string?` | Optional event id when the provider supplies one (Stripe sets this from `event.id`) |
| `waitUntil` | `((promise: Promise<unknown>) => void)?` | Present only when `handle` received `waitUntil` |

## `defineProvider` / `HibikiProvider`

Use `defineProvider` when shipping a custom provider. It is a typed identity helper — no runtime magic.

```ts
import { defineProvider, HibikiError, type ParseResult } from "@hibiki-js/core"

interface Events {
  ping: { ok: true }
}

export const example = defineProvider<"example", Events>({
  name: "example",
  contentTypes: ["application/json"],
  async verify({ headers }) {
    if (!headers.get("x-example-signature")) {
      throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Missing signature", 400)
    }
  },
  async parse(): Promise<ParseResult<Events>> {
    return { kind: "supported", eventName: "ping", event: { ok: true } }
  },
})
```

### `HibikiProvider` members

| Member | Description |
| --- | --- |
| `name` | Unique provider id. Becomes the prefix in event names (`name.event`) |
| `contentTypes?` | Allowed media types checked **after** verification. Compared case-insensitively against the type before `;` |
| `verify(input)` | Signature / authenticity check. Throw `HibikiError` on failure |
| `parse(input)` | Return `{ kind: "supported", eventName, event, id? }` or `{ kind: "unsupported", nativeEventName, id? }` |

### `VerifyInput` / `ParseInput`

| Field | On | Description |
| --- | --- | --- |
| `rawBody` | both | Raw request bytes (`Uint8Array`) |
| `headers` | both | Request headers |
| `request` | both | Original `Request` |
| `text` | parse only | UTF-8 decoded body string |

## `HibikiError`

```ts
class HibikiError extends Error {
  readonly code: HibikiErrorCode
  readonly status: number
}
```

HTTP responses use `error.code` as the **entire** response body. Do not put secrets or payload details in `HibikiError` messages that you expect callers to see — only the code is returned.

| Code | Typical status | When |
| --- | --- | --- |
| `HIBIKI_VERIFICATION_FAILED` | `400` | Signature / authenticity check failed |
| `HIBIKI_PARSE_FAILED` | `400` | Provider `parse` threw a non-`HibikiError` |
| `HIBIKI_UNSUPPORTED_EVENT` | `400` | Unsupported event with `strictEvents: true` |
| `HIBIKI_UNSUPPORTED_CONTENT_TYPE` | `415` | `Content-Type` not in `provider.contentTypes` |
| `HIBIKI_PROVIDER_NOT_REGISTERED` | `500` | Unknown provider name, or duplicate `use()` |
| `HIBIKI_DUPLICATE_HANDLER` | `500` | Second `on()` for the same event |
| `HIBIKI_HANDLER_FAILED` | `500` | Handler or middleware threw |

## Useful types

| Type | Role |
| --- | --- |
| `EventMap` | Constraint for provider event maps |
| `ParseResult<TEvents>` / `SupportedParseResult<TEvents>` | Provider parse return types |
| `ProviderRegistry` | Map of registered providers |
| `RegisteredEventName<R>` | Union of `"provider.event"` strings for registry `R` |
| `HibikiOptions` / `HandleOptions<R>` | Constructor / `handle` option types |

## Related

- [Concepts](/guide/concepts) — builder model, middleware, custom providers
- [Error handling](/guide/error-handling) — response matrix and `strictEvents`
- [Stripe](/reference/stripe) / [GitHub](/reference/github) — provider packages
- [Testing](/reference/testing) — signed request helpers
