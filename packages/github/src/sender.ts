import { encoder, hex } from "../../../internal/encoding.js"
import type { GitHubEvents, GitHubWebhookSenderOptions, GitHubWebhookSender } from "./types.js"

/** Create a client that sends GitHub-compatible, signed webhook deliveries to a URL. */
export function createGitHubWebhook(url: string, options: GitHubWebhookSenderOptions): GitHubWebhookSender {
  const endpoint = new URL(url)
  const fetcher = options.fetch ?? fetch
  if (typeof options.secret !== "string" || !options.secret.trim()) throw new TypeError("Webhook secret must be a non-empty string")
  const keyPromise = crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

  return {
    async send<TEvent extends keyof GitHubEvents>(eventName: TEvent, payload: GitHubEvents[TEvent]): Promise<Response> {
      const body = JSON.stringify(payload)
      const key = await keyPromise
      const signature = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body) as BufferSource)))
      const nativeEventName = String(eventName).split(".", 1)[0]!

      let response: Response
      try {
        response = await fetcher(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            "x-github-event": nativeEventName,
            "x-hub-signature-256": `sha256=${signature}`,
          },
          body,
        })
      } catch (error) {
        throw new Error("GitHub webhook request failed", { cause: error })
      }
      if (!response.ok) throw new Error(`GitHub webhook request failed (${response.status})`)
      return response
    },
  }
}
