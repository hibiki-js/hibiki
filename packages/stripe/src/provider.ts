import { defineProvider, HibikiError, type HibikiProvider, type ParseResult, type SupportedParseResult } from "@hibiki-js/core"
import { encoder, fromHex } from "../../../internal/encoding.js"
import { isSupportedEvent } from "./events.js"
import type { StripeOptions, StripeEvents } from "./types.js"

/** Create a Stripe provider without requiring the Stripe SDK. */
export function stripe(options: StripeOptions): HibikiProvider<"stripe", StripeEvents> {
  const tolerance = options.tolerance ?? 300
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new TypeError("Stripe tolerance must be a non-negative finite number")
  if (typeof options.secret !== "string" || !options.secret.trim()) throw new TypeError("Webhook secret must be a non-empty string")
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
      let signed: Uint8Array | undefined
      const cryptoKey = await keyPromise
      let valid = false
      for (const signature of signatures) {
        const bytes = fromHex(signature)
        if (!bytes) continue
        if (!signed) {
          const prefix = encoder.encode(`${timestamp}.`)
          signed = new Uint8Array(prefix.length + rawBody.length)
          signed.set(prefix)
          signed.set(rawBody, prefix.length)
        }
        if (await crypto.subtle.verify("HMAC", cryptoKey, bytes as BufferSource, signed as BufferSource)) {
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
        if (!id) throw new Error("Missing Stripe event ID")
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
