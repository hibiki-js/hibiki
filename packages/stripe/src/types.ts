type StripeObject<TObject extends string> = { id: string; object: TObject; [key: string]: unknown }
type StripeEvent<TType extends string, TObject> = {
  id: string
  type: TType
  api_version?: string | null
  created?: number
  livemode?: boolean
  data: { object: TObject }
  [key: string]: unknown
}

/** Curated snapshot fields reviewed against docs.stripe.com/api/checkout/sessions/object.
 * Optional for older API versions and minimal fixtures; not runtime validation.
 */
export type StripeCheckoutSession = StripeObject<"checkout.session"> & {
  amount_total?: number | null
  amount_subtotal?: number | null
  currency?: string | null
  client_reference_id?: string | null
  customer?: string | StripeCustomer | StripeDeletedCustomer | null
  customer_email?: string | null
  customer_details?: { email?: string | null; name?: string | null; [key: string]: unknown } | null
  payment_status?: "paid" | "unpaid" | "no_payment_required"
  status?: "open" | "complete" | "expired" | null
  mode?: "payment" | "setup" | "subscription"
  metadata?: Record<string, string> | null
  payment_intent?: string | StripePaymentIntent | null
  subscription?: string | StripeSubscription | null
}
export type StripePaymentIntent = StripeObject<"payment_intent"> & {
  amount?: number
  amount_received?: number
  currency?: string
  status?: "requires_payment_method" | "requires_confirmation" | "requires_action" | "processing" | "requires_capture" | "canceled" | "succeeded"
  customer?: string | StripeCustomer | StripeDeletedCustomer | null
  metadata?: Record<string, string>
}
export type StripeInvoice = StripeObject<"invoice">
export type StripeCustomer = StripeObject<"customer"> & {
  email?: string | null
  name?: string | null
  metadata?: Record<string, string>
  deleted?: false
}
export type StripeDeletedCustomer = StripeObject<"customer"> & { deleted: true }
export type StripeSubscription = StripeObject<"subscription">
export type StripeCharge = StripeObject<"charge">
export type StripePaymentMethod = StripeObject<"payment_method">
export type StripeDispute = StripeObject<"dispute">
export type StripeRefund = StripeObject<"refund">
export type StripeSetupIntent = StripeObject<"setup_intent">

export interface StripeEvents {
  "checkout.session.completed": StripeEvent<"checkout.session.completed", StripeCheckoutSession>
  "checkout.session.expired": StripeEvent<"checkout.session.expired", StripeCheckoutSession>
  "checkout.session.async_payment_succeeded": StripeEvent<"checkout.session.async_payment_succeeded", StripeCheckoutSession>
  "checkout.session.async_payment_failed": StripeEvent<"checkout.session.async_payment_failed", StripeCheckoutSession>
  "payment_intent.succeeded": StripeEvent<"payment_intent.succeeded", StripePaymentIntent>
  "payment_intent.payment_failed": StripeEvent<"payment_intent.payment_failed", StripePaymentIntent>
  "payment_intent.canceled": StripeEvent<"payment_intent.canceled", StripePaymentIntent>
  "payment_intent.requires_action": StripeEvent<"payment_intent.requires_action", StripePaymentIntent>
  "payment_intent.processing": StripeEvent<"payment_intent.processing", StripePaymentIntent>
  "payment_intent.partially_funded": StripeEvent<"payment_intent.partially_funded", StripePaymentIntent>
  "invoice.paid": StripeEvent<"invoice.paid", StripeInvoice>
  "invoice.payment_failed": StripeEvent<"invoice.payment_failed", StripeInvoice>
  "invoice.payment_action_required": StripeEvent<"invoice.payment_action_required", StripeInvoice>
  "invoice.finalized": StripeEvent<"invoice.finalized", StripeInvoice>
  "invoice.upcoming": StripeEvent<"invoice.upcoming", StripeInvoice>
  "invoice.created": StripeEvent<"invoice.created", StripeInvoice>
  "customer.created": StripeEvent<"customer.created", StripeCustomer>
  "customer.updated": StripeEvent<"customer.updated", StripeCustomer>
  "customer.deleted": StripeEvent<"customer.deleted", StripeCustomer | StripeDeletedCustomer>
  "customer.subscription.created": StripeEvent<"customer.subscription.created", StripeSubscription>
  "customer.subscription.updated": StripeEvent<"customer.subscription.updated", StripeSubscription>
  "customer.subscription.deleted": StripeEvent<"customer.subscription.deleted", StripeSubscription>
  "customer.subscription.paused": StripeEvent<"customer.subscription.paused", StripeSubscription>
  "customer.subscription.resumed": StripeEvent<"customer.subscription.resumed", StripeSubscription>
  "customer.subscription.trial_will_end": StripeEvent<"customer.subscription.trial_will_end", StripeSubscription>
  "charge.succeeded": StripeEvent<"charge.succeeded", StripeCharge>
  "charge.failed": StripeEvent<"charge.failed", StripeCharge>
  "charge.refunded": StripeEvent<"charge.refunded", StripeCharge>
  "charge.dispute.created": StripeEvent<"charge.dispute.created", StripeDispute>
  "charge.dispute.updated": StripeEvent<"charge.dispute.updated", StripeDispute>
  "charge.dispute.closed": StripeEvent<"charge.dispute.closed", StripeDispute>
  "refund.created": StripeEvent<"refund.created", StripeRefund>
  "refund.updated": StripeEvent<"refund.updated", StripeRefund>
  "refund.failed": StripeEvent<"refund.failed", StripeRefund>
  "setup_intent.succeeded": StripeEvent<"setup_intent.succeeded", StripeSetupIntent>
  "payment_method.attached": StripeEvent<"payment_method.attached", StripePaymentMethod>
  "payment_method.detached": StripeEvent<"payment_method.detached", StripePaymentMethod>
}

export interface StripeOptions { secret: string; tolerance?: number }

export type StripeWebhookEvent = StripeEvents[keyof StripeEvents]

export interface StripeWebhookSenderOptions {
  /** Signing secret shared with the webhook receiver. */
  secret: string
  /** Override global fetch, for example when running in a custom runtime. */
  fetch?: typeof fetch
}

export interface StripeWebhookSendOptions {
  /** Unix timestamp in seconds. Defaults to the current time. */
  timestamp?: number
}
