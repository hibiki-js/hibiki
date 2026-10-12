# Stripe

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(stripe({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  tolerance: 300,
}))
```

Signature verification uses Web Crypto HMAC-SHA256 and does not depend on the Stripe SDK. Other Stripe events return 200 by default (or 400 with `strictEvents: true`).

This provider supports **snapshot events** with `data.object`, not thin events. Types are curated subsets, not full SDK types or runtime business validation. Common Checkout Session fields (amounts, payment status, metadata, customer) and PaymentIntent/Customer fields are typed and optional for older payloads/minimal fixtures. Additional fields remain `unknown`; validate business requirements explicitly. There is no pinned upstream Stripe API version. The event's `api_version` determines its payload version.

`stripeEvents` exports the readonly native event list for the installed package. [Provider coverage](/providers.json) also includes package versions and formats.

## Supported events

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
- `payment_method.attached`
- `payment_method.detached`

### SetupIntent

- `setup_intent.succeeded`

Handlers are registered with the `stripe.` prefix:

```ts
app.on("stripe.payment_intent.succeeded", async ({ event }) => {
  console.log(event.data.object.id)
})
```

See the [API reference](/reference/stripe) for options and exported types.
