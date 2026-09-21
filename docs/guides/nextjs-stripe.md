# Next.js + Stripe

Call Core from a Route Handler. No Next.js-specific adapter package is required.

```ts
// app/api/webhooks/stripe/route.ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const webhooks = new Hibiki().use(stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
}))

webhooks.on("stripe.payment_intent.succeeded", async ({ event }) => {
  console.log(event.data.object.id)
})

export const POST = (request: Request) =>
  webhooks.handle(request, { provider: "stripe" })
```

Point the Stripe webhook endpoint at `/api/webhooks/stripe` and use the same signing secret you pass to `stripe({ secret })`.
