import { DiscordWebhookError } from "./errors.js"
import type { DiscordWebhook, DiscordWebhookOptions, DiscordWebhookPayload, DiscordWebhookSendOptions, DiscordWebhookMessage } from "./types.js"

/** Create a client for sending messages to an incoming Discord webhook URL. */
export function createDiscordWebhook(url: string, options: DiscordWebhookOptions = {}): DiscordWebhook {
  const endpoint = new URL(url)
  const fetcher = options.fetch ?? fetch
  let defaultUrl: string | undefined

  function send(payload: DiscordWebhookPayload, sendOptions: DiscordWebhookSendOptions & { wait: false }): Promise<undefined>
  function send(payload: DiscordWebhookPayload, sendOptions?: DiscordWebhookSendOptions & { wait?: true }): Promise<DiscordWebhookMessage>
  function send(payload: DiscordWebhookPayload, sendOptions?: DiscordWebhookSendOptions): Promise<DiscordWebhookMessage | undefined>
  async function send(payload: DiscordWebhookPayload, sendOptions: DiscordWebhookSendOptions = {}): Promise<DiscordWebhookMessage | undefined> {
    const wait = sendOptions.wait ?? true
    const threadId = sendOptions.threadId
    const components = payload.components
    const cacheable = wait === true && !components && !threadId
    const cached = cacheable ? defaultUrl : undefined
    const requestUrl = new URL(cached ?? endpoint)
    if (!cached) {
      requestUrl.searchParams.set("wait", String(wait))
      if (threadId) requestUrl.searchParams.set("thread_id", threadId)
      if (components) requestUrl.searchParams.set("with_components", "true")
      else requestUrl.searchParams.delete("with_components")
      if (cacheable) defaultUrl = requestUrl.href
    }

    let body: string | FormData = JSON.stringify(payload)
    if (sendOptions.files?.length) {
      const form = new FormData()
      form.append("payload_json", body)
      sendOptions.files.forEach((file, index) => {
        form.append(`files[${index}]`, file.data, file.filename)
      })
      body = form
    }

    const response = await fetcher(requestUrl, {
      method: "POST",
      redirect: "error",
      ...(sendOptions.signal ? { signal: sendOptions.signal } : {}),
      ...(typeof body === "string" ? { headers: { "content-type": "application/json" } } : {}),
      body,
    })

    if (!response.ok) {
      // Read outside the JSON parse catch so aborts and stream errors propagate.
      const text = await response.text()
      let body: unknown = text
      try { body = JSON.parse(text) } catch { /* Keep non-JSON response text. */ }
      throw new DiscordWebhookError(response.status, response.headers, body)
    }

    if (!wait) return undefined
    if (response.status === 204) throw new Error("Discord webhook returned no message with wait=true")
    return await response.json() as DiscordWebhookMessage
  }
  return { send }
}
