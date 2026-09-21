# Hono

`@hibiki-js/hono` adapts a Hibiki app to a Hono route for one registered provider. `hono` is a peer dependency and is not bundled.

```ts
import { Hono } from "hono"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { hibiki } from "@hibiki-js/hono"

const webhooks = new Hibiki().use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))

webhooks.on("stripe.checkout.session.completed", async ({ event }) => {
  console.log(event.data.object.id)
})

export const app = new Hono().post("/webhooks/stripe", hibiki(webhooks, "stripe"))
```

For a full walkthrough, see [Hono + Stripe](/guides/hono-stripe).
