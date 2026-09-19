import { defineProvider, HibikiError, type HibikiProvider, type ParseResult } from "@hibiki/core"

export interface StripeCheckoutSession { id: string; object: "checkout.session"; [key: string]: unknown }
export interface StripePaymentIntent { id: string; object: "payment_intent"; [key: string]: unknown }
export interface StripeInvoice { id: string; object: "invoice"; [key: string]: unknown }
export interface StripeEvents {
  "checkout.session.completed": { id: string; type: "checkout.session.completed"; data: { object: StripeCheckoutSession } }
  "payment_intent.succeeded": { id: string; type: "payment_intent.succeeded"; data: { object: StripePaymentIntent } }
  "invoice.paid": { id: string; type: "invoice.paid"; data: { object: StripeInvoice } }
}
export interface StripeOptions { secret: string; tolerance?: number }

const encoder = new TextEncoder()
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
const equal = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let different = 0
  for (let i = 0; i < left.length; i++) different |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return different === 0
}

/** Create a Stripe provider without requiring the Stripe SDK. */
export function stripe(options: StripeOptions): HibikiProvider<"stripe", StripeEvents> {
  const tolerance = options.tolerance ?? 300
  return defineProvider<"stripe", StripeEvents>({
    name: "stripe",
    async verify({ rawBody, headers }) {
      const header = headers.get("stripe-signature")
      if (!header) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Missing Stripe signature", 400)
      const values = header.split(",").reduce<Record<string, string[]>>((acc, item) => {
        const [key, value] = item.split("=", 2); if (key && value) (acc[key] ??= []).push(value); return acc
      }, {})
      const timestamp = values.t?.[0]
      if (!timestamp || !/^\d+$/.test(timestamp)) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid Stripe signature", 400)
      if (Math.abs(Date.now() / 1000 - Number(timestamp)) > tolerance) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Expired Stripe signature", 400)
      const signed = new Uint8Array([...encoder.encode(`${timestamp}.`), ...rawBody])
      const key = await crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      const expected = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, signed as unknown as BufferSource)))
      if (!(values.v1 ?? []).some((signature) => equal(expected, signature))) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid Stripe signature", 400)
    },
    async parse({ text }): Promise<ParseResult<StripeEvents>> {
      const payload: unknown = JSON.parse(text)
      if (!payload || typeof payload !== "object") throw new Error("Invalid JSON")
      const event = payload as { id?: unknown; type?: unknown }
      const id = typeof event.id === "string" ? event.id : undefined
      switch (event.type) {
        case "checkout.session.completed":
          return { kind: "supported", eventName: "checkout.session.completed", event: payload as StripeEvents["checkout.session.completed"], ...(id ? { id } : {}) }
        case "payment_intent.succeeded":
          return { kind: "supported", eventName: "payment_intent.succeeded", event: payload as StripeEvents["payment_intent.succeeded"], ...(id ? { id } : {}) }
        case "invoice.paid":
          return { kind: "supported", eventName: "invoice.paid", event: payload as StripeEvents["invoice.paid"], ...(id ? { id } : {}) }
        default: return { kind: "unsupported", nativeEventName: typeof event.type === "string" ? event.type : undefined, ...(id ? { id } : {}) }
      }
    },
  })
}
