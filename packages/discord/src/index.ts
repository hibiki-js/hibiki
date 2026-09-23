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
