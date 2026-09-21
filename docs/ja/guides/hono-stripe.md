# Hono + Stripe

```ts
import { Hono } from "hono"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { hibiki } from "@hibiki-js/hono"

const webhooks = new Hibiki().use(stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
}))

webhooks.on("stripe.checkout.session.completed", async ({ event }) => {
  // 注文の履行など
  console.log(event.data.object.id)
})

const app = new Hono()
app.post("/webhooks/stripe", hibiki(webhooks, "stripe"))

export default app
```

peer も明示的に入れてください。

```bash
pnpm add @hibiki-js/core @hibiki-js/stripe @hibiki-js/hono hono
```
