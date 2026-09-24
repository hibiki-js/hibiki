import { defineProvider, HibikiError, type HibikiProvider, type ParseResult, type SupportedParseResult } from "@hibiki-js/core"

type StripeObject<TObject extends string> = { id: string; object: TObject; [key: string]: unknown }
type StripeEvent<TType extends string, TObject> = {
  id: string
  type: TType
  data: { object: TObject }
  [key: string]: unknown
}

export type StripeCheckoutSession = StripeObject<"checkout.session">
export type StripePaymentIntent = StripeObject<"payment_intent">
export type StripeInvoice = StripeObject<"invoice">
export type StripeCustomer = StripeObject<"customer">
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
  "invoice.paid": StripeEvent<"invoice.paid", StripeInvoice>
  "invoice.payment_failed": StripeEvent<"invoice.payment_failed", StripeInvoice>
  "invoice.payment_action_required": StripeEvent<"invoice.payment_action_required", StripeInvoice>
  "invoice.finalized": StripeEvent<"invoice.finalized", StripeInvoice>
  "invoice.upcoming": StripeEvent<"invoice.upcoming", StripeInvoice>
  "invoice.created": StripeEvent<"invoice.created", StripeInvoice>
  "customer.created": StripeEvent<"customer.created", StripeCustomer>
  "customer.updated": StripeEvent<"customer.updated", StripeCustomer>
  "customer.deleted": StripeEvent<"customer.deleted", StripeCustomer>
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

/** Create a client that sends Stripe-compatible, signed webhook events to a URL. */
export function createStripeWebhook(url: string, options: StripeWebhookSenderOptions) {
  const endpoint = new URL(url)
  const fetcher = options.fetch ?? fetch
  const keyPromise = crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

  return {
    async send(event: StripeWebhookEvent, sendOptions: StripeWebhookSendOptions = {}): Promise<Response> {
      const timestamp = sendOptions.timestamp ?? Math.floor(Date.now() / 1000)
      if (!Number.isInteger(timestamp) || timestamp < 0) throw new TypeError("Stripe webhook timestamp must be a non-negative integer")
      const timestampText = String(timestamp)
      const body = JSON.stringify(event)
      const signedPayload = encoder.encode(`${timestampText}.${body}`)
      const key = await keyPromise
      const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, signedPayload as BufferSource)), byte => byte.toString(16).padStart(2, "0")).join("")

      return fetcher(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": `t=${timestampText},v1=${signature}`,
        },
        body,
      })
    },
  }
}

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

function isSupportedEvent(type: string): type is keyof StripeEvents {
  return Object.hasOwn(SUPPORTED_EVENTS, type)
}

const encoder = new TextEncoder()

function fromHex(value: string): Uint8Array | undefined {
  if (value.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const nibble = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(nibble)) return undefined
    bytes[i] = nibble
  }
  return bytes
}

/** Create a Stripe provider without requiring the Stripe SDK. */
export function stripe(options: StripeOptions): HibikiProvider<"stripe", StripeEvents> {
  const tolerance = options.tolerance ?? 300
  const keyPromise = crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
  return defineProvider<"stripe", StripeEvents>({
    name: "stripe",
    async verify({ rawBody, headers }) {
      const header = headers.get("stripe-signature")
      if (!header) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Missing Stripe signature", 400)
      let timestamp: string | undefined
      const signatures: string[] = []
      for (const item of header.split(",")) {
        const separator = item.indexOf("=")
        if (separator <= 0) continue
        const key = item.slice(0, separator)
        const value = item.slice(separator + 1)
        if (!value) continue
        if (key === "t") timestamp ??= value
        else if (key === "v1") signatures.push(value)
      }
      if (!timestamp || !/^\d+$/.test(timestamp)) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid Stripe signature", 400)
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > tolerance) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Expired Stripe signature", 400)
      const prefix = encoder.encode(`${timestamp}.`)
      const signed = new Uint8Array(prefix.length + rawBody.length)
      signed.set(prefix)
      signed.set(rawBody, prefix.length)
      const cryptoKey = await keyPromise
      let valid = false
      for (const signature of signatures) {
        const bytes = fromHex(signature)
        if (bytes && await crypto.subtle.verify("HMAC", cryptoKey, bytes as BufferSource, signed as BufferSource)) {
          valid = true
          break
        }
      }
      if (!valid) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid Stripe signature", 400)
    },
    async parse({ text }): Promise<ParseResult<StripeEvents>> {
      const payload: unknown = JSON.parse(text)
      if (!payload || typeof payload !== "object") throw new Error("Invalid JSON")
      const event = payload as { id?: unknown; type?: unknown }
      const id = typeof event.id === "string" ? event.id : undefined
      if (typeof event.type === "string" && isSupportedEvent(event.type)) {
        return {
          kind: "supported",
          eventName: event.type,
          event: payload as StripeEvents[typeof event.type],
          ...(id ? { id } : {}),
        } as SupportedParseResult<StripeEvents>
      }
      return { kind: "unsupported", nativeEventName: typeof event.type === "string" ? event.type : undefined, ...(id ? { id } : {}) }
    },
  })
}
