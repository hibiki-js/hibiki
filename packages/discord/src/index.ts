import { defineProvider, HibikiError, type HibikiProvider, type ParseResult, type SupportedParseResult } from "@hibiki-js/core"

export type DiscordInteractionType = 1 | 2 | 3 | 4 | 5

export interface DiscordInteraction<TType extends DiscordInteractionType = DiscordInteractionType> {
  id: string
  application_id: string
  type: TType
  token?: string
  version?: number
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface DiscordEvents {
  ping: DiscordInteraction<1>
  application_command: DiscordInteraction<2>
  message_component: DiscordInteraction<3>
  application_command_autocomplete: DiscordInteraction<4>
  modal_submit: DiscordInteraction<5>
}

/** The public key from your Discord application's General Information page. */
export interface DiscordOptions {
  publicKey: string
  /** Maximum age, in seconds, of a signed interaction. Defaults to 300. */
  tolerance?: number
}

/** A JSON message payload accepted by Discord's Execute Webhook endpoint. */
export interface DiscordWebhookPayload {
  content?: string
  username?: string
  avatar_url?: string
  tts?: boolean
  embeds?: DiscordEmbed[]
  allowed_mentions?: Record<string, unknown>
  components?: Record<string, unknown>[]
  attachments?: Record<string, unknown>[]
  flags?: number
  thread_name?: string
  applied_tags?: string[]
  poll?: Record<string, unknown>
  [key: string]: unknown
}

/** A permissive representation of the message returned by Discord. */
export interface DiscordWebhookMessage {
  id: string
  channel_id: string
  content?: string
  [key: string]: unknown
}

/** A Discord rich embed. Additional Discord embed properties are accepted. */
export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  footer?: Record<string, unknown>
  image?: Record<string, unknown>
  thumbnail?: Record<string, unknown>
  author?: Record<string, unknown>
  fields?: Record<string, unknown>[]
  [key: string]: unknown
}

export interface DiscordWebhookSendOptions {
  /** Send the message to an existing thread in the webhook's channel. */
  threadId?: string
  /** Wait for Discord to confirm delivery and return the created message. Defaults to true. */
  wait?: boolean
}

export interface DiscordWebhookOptions {
  /** Override global fetch, for example when running in a custom runtime. */
  fetch?: typeof fetch
}

/** A small client for sending JSON messages to an incoming Discord webhook. */
export interface DiscordWebhook {
  send(payload: DiscordWebhookPayload, options?: DiscordWebhookSendOptions): Promise<DiscordWebhookMessage | undefined>
}

/** Create a client for sending JSON messages to an incoming Discord webhook URL. */
export function createDiscordWebhook(url: string, options: DiscordWebhookOptions = {}): DiscordWebhook {
  const endpoint = new URL(url)
  const fetcher = options.fetch ?? fetch

  return {
    async send(payload, sendOptions = {}) {
      const requestUrl = new URL(endpoint)
      requestUrl.searchParams.set("wait", String(sendOptions.wait ?? true))
      if (sendOptions.threadId) requestUrl.searchParams.set("thread_id", sendOptions.threadId)
      if (payload.components) requestUrl.searchParams.set("with_components", "true")
      else requestUrl.searchParams.delete("with_components")

      const response = await fetcher(requestUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = ""
        try {
          const error: unknown = await response.json()
          if (error && typeof error === "object" && "message" in error && typeof error.message === "string") detail = `: ${error.message}`
        } catch { /* The response may not contain JSON. */ }
        throw new Error(`Discord webhook request failed (${response.status})${detail}`)
      }

      if (response.status === 204) return undefined
      return await response.json() as DiscordWebhookMessage
    },
  }
}

const encoder = new TextEncoder()

/** Decode a hexadecimal string, returning undefined for malformed input. */
function fromHex(value: string): Uint8Array | undefined {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16)
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

/** Remove expired interaction IDs and report whether an ID was already processed. */
function isReplay(processedInteractions: Map<string, number>, id: string, now: number): boolean {
  for (const [processedId, expiresAt] of processedInteractions) {
    if (expiresAt <= now) processedInteractions.delete(processedId)
  }
  return processedInteractions.has(id)
}

/** Create a Discord Interactions webhook provider using the application's Ed25519 public key. */
export function discord(options: DiscordOptions): HibikiProvider<"discord", DiscordEvents> {
  const tolerance = options.tolerance ?? 300
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new TypeError("Discord tolerance must be a non-negative number")
  const publicKey = fromHex(options.publicKey)
  if (!publicKey || publicKey.length !== 32) throw new TypeError("Discord publicKey must be a 32-byte hexadecimal Ed25519 public key")
  const keyPromise = crypto.subtle.importKey("raw", publicKey as BufferSource, { name: "Ed25519" }, false, ["verify"])
  const processedInteractions = new Map<string, number>()

  return defineProvider<"discord", DiscordEvents>({
    name: "discord",
    contentTypes: ["application/json"],
    async verify({ rawBody, headers }) {
      const signature = headers.get("x-signature-ed25519")
      const timestamp = headers.get("x-signature-timestamp")
      const signatureBytes = signature ? fromHex(signature) : undefined
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
      const now = Date.now()
      if (id && isReplay(processedInteractions, id, now)) return { kind: "unsupported", nativeEventName: "replayed_interaction", id }
      if (id) processedInteractions.set(id, now + tolerance * 1000)
      if (!isInteractionType(interaction.type)) return { kind: "unsupported", nativeEventName: typeof interaction.type === "number" ? String(interaction.type) : undefined, ...(id ? { id } : {}) }
      const eventName = EVENT_NAMES[interaction.type]
      return { kind: "supported", eventName, event: payload as DiscordEvents[typeof eventName], ...(id ? { id } : {}) } as SupportedParseResult<DiscordEvents>
    },
  })
}
