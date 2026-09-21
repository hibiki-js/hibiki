# Concepts

## Immutable builders

`Hibiki` is a type-state builder. `use()` returns a new instance with the provider added; the original builder is unchanged. After you register providers, `on()` only accepts event names that exist on those providers.

```ts
const app = new Hibiki()
  .use(stripe({ secret }))
  .use(github({ secret: githubSecret }))

// Typed as "stripe.*" | "github.*"
app.on("stripe.invoice.paid", ({ event }) => {
  console.log(event.data.object.id)
})
```

## Request pipeline

For every `handle()` call:

1. Resolve the named provider
2. Verify the signature with Web Crypto (`crypto.subtle`)
3. Optionally enforce `contentTypes`
4. Parse the payload
5. Route to exactly one handler, wrapped by middleware

Secrets are always passed by the caller. Hibiki never reads environment variables itself.

## Handlers and responses

| Situation | Default response |
| --- | --- |
| Supported event, handler returns void | `204` |
| Supported event, no handler | `204` |
| Unsupported provider event | `200` (avoids endless provider retries) |
| Handler returns a `Response` | That response |

Pass `{ strictEvents: true }` to the constructor to turn unsupported events into `400` with `HIBIKI_UNSUPPORTED_EVENT`.

## Middleware

Middleware wraps registered handlers only. It does not run for verification failures or unsupported events.

```ts
app.useMiddleware(async (context, next) => {
  const start = performance.now()
  await next()
  console.log(context.provider, performance.now() - start)
})
```

Use middleware for logging, metrics, and tracing. Hibiki does not log by itself.

## Custom providers

```ts
import { defineProvider, type ParseResult } from "@hibiki-js/core"

interface Events {
  ping: { ok: true }
}

export const example = defineProvider<"example", Events>({
  name: "example",
  async verify() {},
  async parse(): Promise<ParseResult<Events>> {
    return { kind: "supported", eventName: "ping", event: { ok: true } }
  },
})
```

Community packages can ship providers under their own scope, for example `@company/hibiki-example`.

## Signature verification

- Raw body bytes come from a cloned `Request`
- Verification uses Web Crypto
- Internal crypto details are never returned in HTTP responses
- Provider packages follow each provider's official webhook scheme
