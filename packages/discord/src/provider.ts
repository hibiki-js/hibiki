import { defineProvider, HibikiError, type HibikiProvider, type ParseResult, type SupportedParseResult } from "@hibiki-js/core"
import { encoder } from "../../../internal/encoding.js"
import { fromHex } from "./signature.js"
import { EVENT_NAMES, isInteractionType } from "./events.js"
import type { DiscordOptions, DiscordEvents } from "./types.js"

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
