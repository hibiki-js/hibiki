# `@hibiki-js/stripe`

厳選したイベント型と Web Crypto 署名検証を持つ Stripe Webhook プロバイダーです。

## インストール

```bash
pnpm add @hibiki-js/core @hibiki-js/stripe
```

## `stripe(options)`

```ts
import { stripe } from "@hibiki-js/stripe"

stripe({
  secret: string,
  tolerance?: number, // 秒。デフォルト 300
})
```

戻り値は `HibikiProvider<"stripe", StripeEvents>` です。

## エクスポートされる型

- `StripeEvents`
- `StripeOptions`
- `StripeCheckoutSession`
- `StripePaymentIntent`
- `StripeInvoice`
- `StripeCustomer`
- `StripeSubscription`
- `StripeCharge`
- `StripePaymentMethod`
- `StripeDispute`

イベントペイロードは Stripe のエンベロープ形に従います。

```ts
{
  id: string
  type: string
  data: { object: ... }
}
```

## 補足

- Stripe SDK 依存なし
- Webhook シークレットで `t.payload` を HMAC-SHA256
- 未対応の Stripe イベント型は、`strictEvents` が無い限り `200`

対応イベント一覧は [Stripe プロバイダーガイド](/ja/providers/stripe) を参照してください。
