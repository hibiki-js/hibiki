# Cloudflare Workers + Stripe

Use Core directly and pass `waitUntil` when background work is needed.

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const webhooks = new Hibiki().use(stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
}))

webhooks.on("stripe.invoice.paid", ({ event, waitUntil }) => {
  waitUntil?.(Promise.resolve().then(() => {
    console.log(event.data.object.id)
  }))
})

export default {
  fetch(
    request: Request,
    _env: unknown,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ) {
    return webhooks.handle(request, {
      provider: "stripe",
      waitUntil: ctx.waitUntil.bind(ctx),
    })
  },
}
```

Store the Stripe signing secret in Workers secrets and pass it into `stripe({ secret })` when constructing the app.
