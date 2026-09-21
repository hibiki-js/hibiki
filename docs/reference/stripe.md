# `@hibiki-js/stripe`

Stripe webhook provider with curated event types and Web Crypto signature verification.

## Install

```bash
pnpm add @hibiki-js/core @hibiki-js/stripe
```

## `stripe(options)`

```ts
import { stripe } from "@hibiki-js/stripe"

stripe({
  secret: string,
  tolerance?: number, // seconds, default 300
})
```

Returns `HibikiProvider<"stripe", StripeEvents>`.

## Exported types

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

Event payloads follow Stripe's envelope shape:

```ts
{
  id: string
  type: string
  data: { object: ... }
}
```

## Notes

- No Stripe SDK dependency
- HMAC-SHA256 over `t.payload` with the webhook secret
- Unsupported Stripe event types return `200` unless `strictEvents` is enabled

See [Stripe provider guide](/providers/stripe) for the full supported event list.
