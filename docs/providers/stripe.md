# Stripe

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  tolerance: 300,
}))
```

Supported events in v0.1:

- `checkout.session.completed`
- `payment_intent.succeeded`
- `invoice.paid`

Signature verification uses Web Crypto HMAC-SHA256 and does not depend on the Stripe SDK.
