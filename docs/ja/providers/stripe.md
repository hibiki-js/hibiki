# Stripe

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  tolerance: 300,
}))
```

署名検証は Web Crypto の HMAC-SHA256 を使い、Stripe SDK には依存しません。その他の Stripe イベントはデフォルトで 200（`strictEvents: true` なら 400）です。

`data.object`を持つsnapshotイベントに対応しています。thinイベントは対象外です。型は構造の一部を定義したもので、完全なSDKの型や業務データの実行時検証は提供しません。Checkout Sessionの金額・決済状態・metadata・customer、PaymentIntentとCustomerの主要フィールドに型があります。古いpayloadや小さなテストデータも扱えるよう、追加フィールドは省略可能です。その他は`unknown`のため、業務に必要な値を明示的に検証してください。StripeのAPIバージョンは固定していません。イベントの`api_version`がpayloadのバージョンを表します。

`stripeEvents`から、導入したパッケージの対応イベント一覧を取得できます。[対応範囲のJSON](/providers.json)にもパッケージバージョンと形式を載せています。

## 対応イベント

### Checkout

- `checkout.session.completed`
- `checkout.session.expired`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`

### PaymentIntent

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `payment_intent.requires_action`
- `payment_intent.processing`
- `payment_intent.partially_funded`

### Invoice

- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `invoice.finalized`
- `invoice.upcoming`
- `invoice.created`

### Customer / Subscription

- `customer.created`
- `customer.updated`
- `customer.deleted`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `customer.subscription.trial_will_end`

### Charge / Dispute / Refund / PaymentMethod

- `charge.succeeded`
- `charge.failed`
- `charge.refunded`
- `charge.dispute.created`
- `charge.dispute.updated`
- `charge.dispute.closed`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `payment_method.attached`
- `payment_method.detached`

### SetupIntent

- `setup_intent.succeeded`

ハンドラは `stripe.` プレフィックスで登録します。

```ts
app.on("stripe.payment_intent.succeeded", async ({ event }) => {
  console.log(event.data.object.id)
})
```

オプションと型の詳細は [API リファレンス](/ja/reference/stripe) を参照してください。
