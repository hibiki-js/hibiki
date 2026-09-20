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

Next:

- [Providers](./providers/stripe.md)
- [Frameworks](./frameworks/hono.md)
- [Guides](./guides/testing.md)
