/** An unsuccessful HTTP response from Discord's Execute Webhook endpoint. */
export class DiscordWebhookError extends Error {
  readonly headers: Headers
  /** Seconds to wait before retrying, or undefined when Discord supplies no valid delay. */
  readonly retryAfterSeconds: number | undefined

  constructor(readonly status: number, headers: Headers, readonly body: unknown) {
    const detail = body && typeof body === "object" && "message" in body && typeof body.message === "string"
      ? `: ${body.message}` : ""
    super(`Discord webhook request failed (${status})${detail}`)
    this.name = "DiscordWebhookError"
    this.headers = new Headers(headers)
    this.retryAfterSeconds = retryAfterSeconds(this.headers, body)
  }
}

function retryAfterSeconds(headers: Headers, body: unknown): number | undefined {
  const header = headers.get("retry-after")?.trim()
  if (header && /^\d+(?:\.\d+)?$/.test(header)) {
    const seconds = Number(header)
    if (Number.isFinite(seconds)) return seconds
  }
  if (header && /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),/i.test(header)) {
    const date = Date.parse(header)
    if (Number.isFinite(date)) return Math.max(0, (date - Date.now()) / 1000)
  }
  if (body && typeof body === "object" && "retry_after" in body) {
    const seconds = body.retry_after
    if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) return seconds
  }
  return undefined
}
