import type { Hibiki, ProviderRegistry } from "@hibiki-js/core"

const encoder = new TextEncoder()
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")

async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body) as unknown as BufferSource)))
}

/** Create a correctly signed Stripe JSON request for tests. */
export async function stripeRequest(payload: unknown, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<Request> {
  const body = JSON.stringify(payload)
  const signature = await hmac(secret, `${timestamp}.${body}`)
  return new Request("https://hibiki.test/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body })
}

/** Create a correctly signed GitHub JSON request for tests. */
export async function githubRequest(payload: unknown, event: string, secret: string, contentType = "application/json"): Promise<Request> {
  const body = JSON.stringify(payload)
  return new Request("https://hibiki.test/webhook", { method: "POST", headers: { "content-type": contentType, "x-github-event": event, "x-hub-signature-256": `sha256=${await hmac(secret, body)}` }, body })
}

/** Small test harness for sending Requests through a Hibiki app. */
export function createWebhookTest<R extends ProviderRegistry>(app: Hibiki<R>) {
  return { emit: (request: Request, provider: Parameters<Hibiki<R>["handle"]>[1]["provider"]) => app.handle(request, { provider }) }
}
