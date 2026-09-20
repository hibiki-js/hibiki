import type { Hibiki, ProviderRegistry, RegisteredEventName } from "@hibiki-js/core"

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

type Secrets<R extends ProviderRegistry> = Partial<Record<keyof R & string, string>>

function splitEventName(eventName: string): { provider: string; nativeEventName: string } {
  const index = eventName.indexOf(".")
  if (index <= 0) throw new Error(`Invalid event name: ${eventName}`)
  return { provider: eventName.slice(0, index), nativeEventName: eventName.slice(index + 1) }
}

async function requestForEvent(provider: string, nativeEventName: string, payload: unknown, secret: string): Promise<Request> {
  if (provider === "stripe") {
    const body = typeof payload === "object" && payload && "type" in payload
      ? payload
      : { id: "evt_test", type: nativeEventName, data: { object: payload } }
    return stripeRequest(body, secret)
  }
  if (provider === "github") {
    const [event, action] = nativeEventName.split(".", 2)
    const body = action && !(payload && typeof payload === "object" && "action" in payload)
      ? { ...(payload as object), action }
      : payload
    return githubRequest(body, event ?? nativeEventName, secret)
  }
  throw new Error(`No signed-request helper for provider: ${provider}`)
}

/** Small test harness for sending Requests through a Hibiki app. */
export function createWebhookTest<R extends ProviderRegistry>(app: Hibiki<R>, options: { secrets?: Secrets<R> } = {}) {
  return {
    emit: (request: Request, provider: Parameters<Hibiki<R>["handle"]>[1]["provider"]) => app.handle(request, { provider }),
    /** Emit a signed provider event by Hibiki event name, e.g. `stripe.checkout.session.completed`. */
    async emitEvent(eventName: RegisteredEventName<R>, payload: unknown = {}) {
      const { provider, nativeEventName } = splitEventName(eventName)
      const secret = options.secrets?.[provider]
      if (!secret) throw new Error(`Missing secret for provider: ${provider}`)
      const request = await requestForEvent(provider, nativeEventName, payload, secret)
      return app.handle(request, { provider: provider as Parameters<Hibiki<R>["handle"]>[1]["provider"] })
    },
  }
}
