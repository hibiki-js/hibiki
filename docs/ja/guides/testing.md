# テスト

`@hibiki-js/testing` は、Stripe / GitHub と通信せずに `handle()` を試せるよう、正しく署名されたリクエストを組み立てます。

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { createWebhookTest } from "@hibiki-js/testing"

const app = new Hibiki().use(stripe({ secret: "whsec_test" }))

app.on("stripe.checkout.session.completed", ({ event }) => {
  console.log(event.data.object.id)
})

const webhook = createWebhookTest(app, { secrets: { stripe: "whsec_test" } })

await webhook.emitEvent("stripe.checkout.session.completed", {
  id: "cs_test",
  object: "checkout.session",
})
```

ヘッダーやタイムスタンプを細かく制御したいときは、低レベルな `stripeRequest` / `githubRequest` も使えます。

API の全体は [testing リファレンス](/ja/reference/testing) を参照してください。
