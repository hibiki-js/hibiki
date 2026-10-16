import { encoder, hex } from "../../../internal/encoding.js"
import type { StripeWebhookEvent, StripeWebhookSenderOptions, StripeWebhookSendOptions } from "./types.js"

/** Create a client that sends Stripe-compatible, signed webhook events to a URL. */
export function createStripeWebhook(url: string, options: StripeWebhookSenderOptions) {
  const endpoint = new URL(url)
  const fetcher = options.fetch ?? fetch
  if (typeof options.secret !== "string" || !options.secret.trim()) throw new TypeError("Webhook secret must be a non-empty string")
  const keyPromise = crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

  return {
    async send(event: StripeWebhookEvent, sendOptions: StripeWebhookSendOptions = {}): Promise<Response> {
      const timestamp = sendOptions.timestamp ?? Math.floor(Date.now() / 1000)
      if (!Number.isInteger(timestamp) || timestamp < 0) throw new TypeError("Stripe webhook timestamp must be a non-negative integer")
      const timestampText = String(timestamp)
      const body = JSON.stringify(event)
      const signedPayload = encoder.encode(`${timestampText}.${body}`)
      const key = await keyPromise
      const signature = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, signedPayload as BufferSource)))

      return fetcher(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "content-type": "application/json",
          "stripe-signature": `t=${timestampText},v1=${signature}`,
        },
        body,
      })
    },
  }
}
