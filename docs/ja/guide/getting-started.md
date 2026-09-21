# はじめに

必要なパッケージだけ入れてください。Hibiki のパッケージはランタイム依存を持ちません。

```bash
pnpm add @hibiki-js/core @hibiki-js/stripe
```

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))

app.on("stripe.checkout.session.completed", async ({ event }) => {
  console.log(event.data.object.id)
})

export const POST = (request: Request) => app.handle(request, { provider: "stripe" })
```

## リクエストごとの流れ

1. Hibiki がリクエストを clone して生の body バイトを読む
2. プロバイダーが署名を検証する
3. プロバイダーがペイロードを型付きイベントにパースする（または unsupported にする）
4. ハンドラが走る。何もすることがなければ `204` / `200` を返す

## 次のステップ

- [コンセプト](./concepts) — ビルダー、ミドルウェア、カスタムプロバイダー
- [Stripe](../providers/stripe) / [GitHub](../providers/github) — 対応イベント
- [Next.js + Stripe](../guides/nextjs-stripe) — 一連のつなぎ方
