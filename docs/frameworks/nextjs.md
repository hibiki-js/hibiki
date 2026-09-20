# Next.js

Call Core from a Route Handler. No Next.js-specific adapter package is required in v0.1.

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const webhooks = new Hibiki().use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))
webhooks.on("stripe.payment_intent.succeeded", async ({ event }) => {
  console.log(event.data.object.id)
})

export const POST = (request: Request) => webhooks.handle(request, { provider: "stripe" })
```
