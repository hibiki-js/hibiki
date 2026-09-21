# Hono

`@hibiki-js/hono` は、登録済みプロバイダー 1 つ分の Hibiki アプリを Hono ルートに接続します。`hono` は peer dependency で、バンドルされません。

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

一連の手順は [Hono + Stripe](/ja/guides/hono-stripe) を参照してください。
