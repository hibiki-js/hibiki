import { hmac, type Signer } from "./signing.js"

/** Create a correctly signed Stripe JSON request for tests. */
export async function stripeRequest(payload: unknown, secret: string, timestamp = Math.floor(Date.now() / 1000)): Promise<Request> {
  const body = JSON.stringify(payload)
  const signature = await hmac(secret, `${timestamp}.${body}`)
  return new Request("https://hibiki.test/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body })
}

export async function signedStripeRequest(payload: unknown, secret: string, sign: Signer, timestamp = Math.floor(Date.now() / 1000)): Promise<Request> {
  const body = JSON.stringify(payload)
  const signature = await sign(secret, `${timestamp}.${body}`)
  return new Request("https://hibiki.test/webhook", { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${timestamp},v1=${signature}` }, body })
}

/** Create a correctly signed GitHub JSON request for tests. */
export async function githubRequest(payload: unknown, event: string, secret: string, contentType = "application/json"): Promise<Request> {
  const body = JSON.stringify(payload)
  return new Request("https://hibiki.test/webhook", { method: "POST", headers: { "content-type": contentType, "x-github-event": event, "x-hub-signature-256": `sha256=${await hmac(secret, body)}` }, body })
}

export async function signedGitHubRequest(payload: unknown, event: string, secret: string, sign: Signer, contentType = "application/json"): Promise<Request> {
  const body = JSON.stringify(payload)
  return new Request("https://hibiki.test/webhook", { method: "POST", headers: { "content-type": contentType, "x-github-event": event, "x-hub-signature-256": `sha256=${await sign(secret, body)}` }, body })
}
