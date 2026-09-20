# Hibiki

Type-safe webhooks for TypeScript.

Zero runtime dependencies.
Built on Web Standards.

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))
app.on("stripe.checkout.session.completed", async ({ event }) => {
  console.log(event.data.object.id)
})

export const POST = (request: Request) => app.handle(request, { provider: "stripe" })
```

- Type-safe event handlers
- Zero runtime dependencies
- Web Standards `Request` / `Response`
- Edge-ready
- Multi-provider

Hibiki verifies signatures before parsing, preserves the original request body for handlers, and returns 200 for unsupported provider events (or 400 with `strictEvents: true`). Supported events without a handler return 204.

Supported providers: Stripe and GitHub. Hono is available through `@hibiki-js/hono`; Next.js Route Handlers and Cloudflare Workers call Core directly.

Docs: [Getting Started](./docs/getting-started.md)
