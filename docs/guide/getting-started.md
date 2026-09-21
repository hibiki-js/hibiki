# Getting Started

Install the packages you need. Hibiki packages have zero runtime dependencies.

```bash
pnpm add @hibiki-js/core @hibiki-js/stripe
```

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))

app.on("stripe.checkout.session.completed", async ({ event }) => {
  console.log(event.data.object.id)
})

export const POST = (request: Request) => app.handle(request, { provider: "stripe" })
```

## What happens on each request

1. Hibiki clones the request and reads the raw body bytes
2. The provider verifies the signature
3. The provider parses the payload into a typed event (or marks it unsupported)
4. Your handler runs, or Hibiki returns `204` / `200` when there is nothing to do

## Next steps

- [Concepts](./concepts) — builders, middleware, and custom providers
- [Stripe](../providers/stripe) / [GitHub](../providers/github) — curated event coverage
- [Next.js + Stripe](../guides/nextjs-stripe) — end-to-end wiring
