# Cloudflare Workers + Stripe

Core を直接使い、バックグラウンド処理が必要なら `waitUntil` を渡します。

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

Stripe の署名シークレットは Workers の secrets に置き、アプリ構築時に `stripe({ secret })` へ渡してください。
