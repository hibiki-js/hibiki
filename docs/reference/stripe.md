# `@hibiki-js/stripe`

Official Stripe webhook provider for Hibiki. It verifies `Stripe-Signature` with Web Crypto and exposes a curated set of typed events. The Stripe Node SDK is **not** a dependency.

## Install

```bash
pnpm add @hibiki-js/core @hibiki-js/stripe
```

## Quick example

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

Handlers use the `stripe.` prefix. The native Stripe type (`checkout.session.completed`) becomes `stripe.checkout.session.completed`.

## `stripe(options)`

```ts
import { stripe } from "@hibiki-js/stripe"

const provider = stripe({
  secret: string,
  tolerance?: number, // seconds, default 300
})
```

Returns `HibikiProvider<"stripe", StripeEvents>`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `secret` | `string` | — | Webhook signing secret from the Stripe Dashboard (`whsec_...`) |
| `tolerance` | `number` | `300` | Maximum age of the signature timestamp, in seconds |

### Verification

1. Read the `Stripe-Signature` header (`t=…,v1=…` pairs)
2. Reject missing / malformed headers and non-numeric timestamps
3. Reject timestamps older than `tolerance`
4. Verify HMAC-SHA256 over `` `${t}.${rawBody}` `` with the webhook secret

Failures throw `HibikiError` with `HIBIKI_VERIFICATION_FAILED` (`400`). Hex decoding mistakes and wrong secrets take the same path — responses never include crypto details.

### Parsing

The body must be JSON with a Stripe event envelope. Supported `type` values are routed as typed events; anything else is `{ kind: "unsupported" }` and becomes HTTP `200` by default (or `400` with `strictEvents: true`).

When present, Stripe's `event.id` is copied onto `HibikiContext.id`.

## Event payload shape

Every supported Stripe handler receives Stripe's envelope, not the inner object alone:

```ts
{
  id: string
  type: "invoice.paid" // literal per event
  data: { object: StripeInvoice /* etc */ }
  // plus Stripe's other event fields via index signature
}
```

Object helpers exported by this package (`StripeInvoice`, `StripeCharge`, …) describe `data.object` with required `id` / `object` fields and an index signature for the rest of Stripe's fields. Hibiki intentionally keeps these types thin; pull richer types from Stripe's own packages if you need them.

## Exported types

| Export | Description |
| --- | --- |
| `stripe` | Provider factory |
| `StripeEvents` | Map of supported event name → payload type |
| `StripeOptions` | `{ secret; tolerance? }` |
| `StripeCheckoutSession` | `data.object` for Checkout Session events |
| `StripePaymentIntent` | PaymentIntent object |
| `StripeInvoice` | Invoice object |
| `StripeCustomer` | Customer object |
| `StripeSubscription` | Subscription object |
| `StripeCharge` | Charge object |
| `StripePaymentMethod` | PaymentMethod object |
| `StripeDispute` | Dispute object |
| `StripeRefund` | Refund object |
| `StripeSetupIntent` | SetupIntent object |

## Notes

- No Stripe SDK dependency — verification uses `crypto.subtle` only
- Content-Type is not restricted by this provider (Stripe sends JSON; body is still parsed as JSON text)
- Unsupported Stripe event types are ignored with `200` unless Core `strictEvents` is enabled
- Use `@hibiki-js/testing` (`stripeRequest` / `createWebhookTest`) to emit signed events in tests

## Related

- [Stripe provider guide](/providers/stripe) — full supported event list
- [Next.js + Stripe](/guides/nextjs-stripe) / [Hono + Stripe](/guides/hono-stripe)
- [Core reference](/reference/core) — `handle`, responses, errors
