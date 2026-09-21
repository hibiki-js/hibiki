# Next.js + Stripe

Route Handler から Core を直接呼びます。Next.js 専用アダプターは不要です。

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

Stripe の Webhook エンドポイントを `/api/webhooks/stripe` に向け、`stripe({ secret })` に渡す署名シークレットと同じものを使ってください。
