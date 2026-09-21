# `@hibiki-js/stripe`

Hibiki 向けの公式 Stripe Webhook プロバイダーです。`Stripe-Signature` を Web Crypto で検証し、よく使うイベントを型付きで公開します。Stripe Node SDK には**依存しません**。

## インストール

```bash
pnpm add @hibiki-js/core @hibiki-js/stripe
```

## 短い例

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  tolerance: 300,
}))

app.on("stripe.checkout.session.completed", async ({ event }) => {
  console.log(event.id, event.data.object.id)
})

export async function POST(request: Request) {
  return app.handle(request, { provider: "stripe" })
}
```

ハンドラは `stripe.` プレフィックスを使います。Stripe 側の型名（`checkout.session.completed`）は `stripe.checkout.session.completed` になります。

## `stripe(options)`

```ts
import { stripe } from "@hibiki-js/stripe"

const provider = stripe({
  secret: string,
  tolerance?: number, // 秒。デフォルト 300
})
```

戻り値は `HibikiProvider<"stripe", StripeEvents>` です。

| オプション | 型 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `secret` | `string` | — | Stripe Dashboard の Webhook 署名シークレット（`whsec_...`） |
| `tolerance` | `number` | `300` | 署名タイムスタンプの許容秒数 |

### 検証

1. `Stripe-Signature` ヘッダー（`t=…,v1=…`）を読む
2. 欠落・不正なヘッダー、数値でない timestamp を拒否する
3. `tolerance` より古い timestamp を拒否する
4. Webhook シークレットで `` `${t}.${rawBody}` `` の HMAC-SHA256 を検証する

失敗時は `HIBIKI_VERIFICATION_FAILED`（`400`）の `HibikiError` です。hex の解釈ミスやシークレット誤りも同じ経路で、応答に暗号の詳細は出しません。

### パース

Body は Stripe イベント封筒の JSON である必要があります。対応する `type` は型付きイベントとして振り分け、それ以外は `{ kind: "unsupported" }` になり、既定では HTTP `200`（`strictEvents: true` なら `400`）です。

`event.id` がある場合は `HibikiContext.id` にコピーします。

## イベントの形

対応する Stripe ハンドラが受け取るのは内側のオブジェクト単体ではなく、Stripe の封筒です。

```ts
{
  id: string
  type: "invoice.paid" // イベントごとのリテラル
  data: { object: StripeInvoice /* など */ }
  // ほかの Stripe フィールドは index signature
}
```

このパッケージが export するオブジェクト型（`StripeInvoice`、`StripeCharge` など）は、必須の `id` / `object` とそれ以外の index signature だけの薄い型です。より詳しい型が必要なら Stripe 公式パッケージ側を使ってください。

## export する型

| Export | 説明 |
| --- | --- |
| `stripe` | プロバイダー工場関数 |
| `StripeEvents` | 対応イベント名 → ペイロード型 |
| `StripeOptions` | `{ secret; tolerance? }` |
| `StripeCheckoutSession` | Checkout Session の `data.object` |
| `StripePaymentIntent` | PaymentIntent |
| `StripeInvoice` | Invoice |
| `StripeCustomer` | Customer |
| `StripeSubscription` | Subscription |
| `StripeCharge` | Charge |
| `StripePaymentMethod` | PaymentMethod |
| `StripeDispute` | Dispute |
| `StripeRefund` | Refund |
| `StripeSetupIntent` | SetupIntent |

## 補足

- Stripe SDK 非依存。検証は `crypto.subtle` のみ
- このプロバイダーは Content-Type を制限しない（Stripe は JSON を送り、body は JSON テキストとしてパースする）
- 未対応の Stripe イベントは Core の `strictEvents` が無い限り `200` で無視する
- テストでは `@hibiki-js/testing`（`stripeRequest` / `createWebhookTest`）で署名付きイベントを送る

## 関連

- [Stripe プロバイダーガイド](/ja/providers/stripe) — 対応イベント一覧
- [Next.js + Stripe](/ja/guides/nextjs-stripe) / [Hono + Stripe](/ja/guides/hono-stripe)
- [Core リファレンス](/ja/reference/core) — `handle`・応答・エラー
