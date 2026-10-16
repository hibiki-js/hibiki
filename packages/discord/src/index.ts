import { defineProvider, HibikiError, type HibikiProvider, type ParseResult, type SupportedParseResult } from "@hibiki-js/core"

import type {
  DiscordInteractionType,
  DiscordInteraction,
  DiscordEvents,
  DiscordOptions,
  DiscordWebhookPayload,
  DiscordWebhookMessage,
  DiscordEmbed,
  DiscordWebhookFile,
  DiscordWebhookSendOptions,
  DiscordWebhookOptions,
  DiscordWebhook,
} from "./types.js"
export type {
  DiscordInteractionType,
  DiscordInteraction,
  DiscordEvents,
  DiscordOptions,
  DiscordWebhookPayload,
  DiscordWebhookMessage,
  DiscordEmbed,
  DiscordWebhookFile,
  DiscordWebhookSendOptions,
  DiscordWebhookOptions,
  DiscordWebhook,
} from "./types.js"

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

const encoder = /* @__PURE__ */ new TextEncoder()

/** Decode a hexadecimal string, returning undefined for malformed input. */
function fromHex(value: string): Uint8Array | undefined {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(value.length / 2)
  // The validation above limits input to ASCII hex; A-F/a-f need a +9 correction.
  for (let i = 0; i < bytes.length; i++) {
    const high = value.charCodeAt(i * 2)
    const low = value.charCodeAt(i * 2 + 1)
    bytes[i] = (((high & 15) + (high > 57 ? 9 : 0)) << 4) | ((low & 15) + (low > 57 ? 9 : 0))
  }
  return bytes
}

const EVENT_NAMES = {
  1: "ping",
  2: "application_command",
  3: "message_component",
  4: "application_command_autocomplete",
  5: "modal_submit",
} as const satisfies Record<DiscordInteractionType, keyof DiscordEvents>

/** Return whether a value is an interaction type supported by this provider. */
function isInteractionType(value: unknown): value is DiscordInteractionType {
  return typeof value === "number" && Object.hasOwn(EVENT_NAMES, value)
}

/** Create a Discord Interactions webhook provider using the application's Ed25519 public key. */
export function discord(options: DiscordOptions): HibikiProvider<"discord", DiscordEvents> {
  const tolerance = options.tolerance ?? 300
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new TypeError("Discord tolerance must be a non-negative number")
  const publicKey = fromHex(options.publicKey)
  if (!publicKey || publicKey.length !== 32) throw new TypeError("Discord publicKey must be a 32-byte hexadecimal Ed25519 public key")
  const keyPromise = crypto.subtle.importKey("raw", publicKey as BufferSource, { name: "Ed25519" }, false, ["verify"])

  return defineProvider<"discord", DiscordEvents>({
    name: "discord",
    contentTypes: ["application/json"],
    async verify({ rawBody, headers }) {
      const signature = headers.get("x-signature-ed25519")
      const timestamp = headers.get("x-signature-timestamp")
      const signatureBytes = signature?.length === 128 ? fromHex(signature) : undefined
      const timestampSeconds = timestamp ? Number(timestamp) : Number.NaN
      if (!timestamp || !Number.isInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > tolerance || !signatureBytes || signatureBytes.length !== 64) {
        throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Missing or invalid Discord signature", 401)
      }
      const timestampBytes = encoder.encode(timestamp)
      const signed = new Uint8Array(timestampBytes.length + rawBody.length)
      signed.set(timestampBytes)
      signed.set(rawBody, timestampBytes.length)
      const key = await keyPromise
      if (!await crypto.subtle.verify("Ed25519", key, signatureBytes as BufferSource, signed as BufferSource)) {
        throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid Discord signature", 401)
      }
    },
    async parse({ text }): Promise<ParseResult<DiscordEvents>> {
      const payload: unknown = JSON.parse(text)
      if (!payload || typeof payload !== "object") throw new Error("Invalid JSON")
      const interaction = payload as { id?: unknown; type?: unknown }
      const id = typeof interaction.id === "string" ? interaction.id : undefined
      if (!isInteractionType(interaction.type)) return { kind: "unsupported", nativeEventName: typeof interaction.type === "number" ? String(interaction.type) : undefined, ...(id ? { id } : {}) }
      if (!id) throw new Error("Missing Discord interaction ID")
      const eventName = EVENT_NAMES[interaction.type]
      return { kind: "supported", eventName, event: payload as DiscordEvents[typeof eventName], ...(id ? { id } : {}) } as SupportedParseResult<DiscordEvents>
    },
  })
}
