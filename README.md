# Hibiki

Type-safe webhooks for TypeScript. Zero runtime dependencies. Built on Web Standards.

```ts
import { Hibiki } from "@hibiki/core"
import { stripe } from "@hibiki/stripe"

const app = new Hibiki().use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))
app.on("stripe.checkout.session.completed", async ({ event }) => {
  console.log(event.data.object.id)
})

export const POST = (request: Request) => app.handle(request, { provider: "stripe" })
```

Hibiki verifies signatures before parsing, preserves the original request body for handlers, and returns 204 for supported events without a handler. Use `strictEvents: true` to reject provider events that Hibiki does not support.

Supported providers: Stripe and GitHub. Hono is available through `@hibiki/hono`; Next.js Route Handlers and Cloudflare Workers call Core directly.
