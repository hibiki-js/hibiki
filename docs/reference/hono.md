# `@hibiki-js/hono`

Thin adapter that turns a Hibiki app into a Hono route handler for one registered provider. Hibiki Core already speaks `Request` / `Response`, so this package only bridges Hono's context to `Hibiki#handle`.

## Install

```bash
pnpm add @hibiki-js/core @hibiki-js/hono hono
```

`hono` and `@hibiki-js/core` are peer dependencies. Hibiki does not bundle Hono.

Requires Hono `^4.0.0`.

## Quick example

```ts
import { Hono } from "hono"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { hibiki } from "@hibiki-js/hono"

const webhooks = new Hibiki()
  .use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))

webhooks.on("stripe.invoice.paid", async ({ event }) => {
  console.log(event.data.object.id)
})

export const app = new Hono()
  .post("/webhooks/stripe", hibiki(webhooks, "stripe"))
```

## `hibiki(app, provider)`

```ts
import { hibiki } from "@hibiki-js/hono"
import type { MiddlewareHandler } from "hono"

function hibiki(
  app: Hibiki<R>,
  provider: /* registered provider name */,
): MiddlewareHandler
```

| Argument | Description |
| --- | --- |
| `app` | Hibiki instance with providers / handlers already configured |
| `provider` | Provider name passed through to `app.handle` (for example `"stripe"` or `"github"`) |

Behavior:

1. Read the raw Web Standards request from `context.req.raw`
2. Call `app.handle(rawRequest, { provider })`
3. Return that `Response` to Hono

There is no extra body buffering, header rewriting, or status mapping. Signature verification, parsing, and status codes all come from Core / the provider package.

### Multiple providers

Mount one route per provider. Each call to `hibiki(...)` binds a single provider name:

```ts
const webhooks = new Hibiki()
  .use(stripe({ secret: stripeSecret }))
  .use(github({ secret: githubSecret }))

const app = new Hono()
  .post("/webhooks/stripe", hibiki(webhooks, "stripe"))
  .post("/webhooks/github", hibiki(webhooks, "github"))
```

### `waitUntil`

The adapter does not forward platform `waitUntil` helpers. If you need them (for example on Cloudflare Workers with Hono), call Core `handle` yourself and pass `waitUntil` in the options object — see the [Cloudflare + Stripe guide](/guides/cloudflare-stripe).

## Types

Re-exports `RegisteredEventName` from `@hibiki-js/core` for convenience when typing event names alongside the adapter.

## Related

- [Hono integration](/integrations/hono)
- [Hono + Stripe walkthrough](/guides/hono-stripe)
- [Core reference](/reference/core)
