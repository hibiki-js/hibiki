import type { StripeEvents } from "./types.js"

const SUPPORTED_EVENTS = {
  "checkout.session.completed": true,
  "checkout.session.expired": true,
  "checkout.session.async_payment_succeeded": true,
  "checkout.session.async_payment_failed": true,
  "payment_intent.succeeded": true,
  "payment_intent.payment_failed": true,
  "payment_intent.canceled": true,
  "payment_intent.requires_action": true,
  "invoice.paid": true,
  "invoice.payment_failed": true,
  "invoice.payment_action_required": true,
  "invoice.finalized": true,
  "invoice.upcoming": true,
  "invoice.created": true,
  "customer.created": true,
  "customer.updated": true,
  "customer.deleted": true,
  "customer.subscription.created": true,
  "customer.subscription.updated": true,
  "customer.subscription.deleted": true,
  "customer.subscription.paused": true,
  "customer.subscription.resumed": true,
  "customer.subscription.trial_will_end": true,
  "charge.succeeded": true,
  "charge.failed": true,
  "charge.refunded": true,
  "charge.dispute.created": true,
  "charge.dispute.updated": true,
  "charge.dispute.closed": true,
  "refund.created": true,
  "refund.updated": true,
  "setup_intent.succeeded": true,
  "payment_method.attached": true,
  "payment_method.detached": true,
} as const satisfies Record<keyof StripeEvents, true>

/** Native snapshot event names supported by this release. */
export const stripeEvents: readonly (keyof StripeEvents)[] = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ Object.keys(SUPPORTED_EVENTS) as (keyof StripeEvents)[],
)

export function isSupportedEvent(type: string): type is keyof StripeEvents {
  return Object.hasOwn(SUPPORTED_EVENTS, type)
}
