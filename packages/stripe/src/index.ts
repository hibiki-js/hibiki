import { defineProvider, HibikiError, type HibikiProvider, type ParseResult } from "@hibiki-js/core"

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
