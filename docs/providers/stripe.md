# Stripe

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  tolerance: 300,
}))
```

Supported events:

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

### Invoice
- `invoice.paid`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `invoice.finalized`

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

### Charge / PaymentMethod
- `charge.succeeded`
- `charge.failed`
- `charge.refunded`
- `charge.dispute.created`
- `payment_method.attached`
- `payment_method.detached`

Signature verification uses Web Crypto HMAC-SHA256 and does not depend on the Stripe SDK. Other Stripe events return 200 by default (or 400 with `strictEvents: true`).
