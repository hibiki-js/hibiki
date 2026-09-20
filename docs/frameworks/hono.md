# Hono

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

`hono` is a peer dependency of `@hibiki-js/hono`. Hibiki does not install or bundle it.
