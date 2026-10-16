import { defineProvider, HibikiError, type HibikiProvider, type ParseResult, type SupportedParseResult } from "@hibiki-js/core"
import { encoder, hex, fromHex } from "../../../internal/encoding.js"
import { ACTION_EVENTS } from "./events.js"
import { isRecord, validatePayload } from "./payload.js"
import type { GitHubEvents, GitHubOptions } from "./types.js"

/** Create a GitHub JSON webhook provider without Octokit. */
export function github(options: GitHubOptions): HibikiProvider<"github", GitHubEvents> {
  const allowedEvents = options.allowedEvents ? new Set(options.allowedEvents) : undefined
  const allowedRepositories = options.allowedRepositories ? new Set(options.allowedRepositories) : undefined
  if (typeof options.secret !== "string" || !options.secret.trim()) throw new TypeError("Webhook secret must be a non-empty string")
  const keyPromise = crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
  return defineProvider<"github", GitHubEvents>({
    name: "github", contentTypes: ["application/json"],
    async verify({ rawBody, headers }) {
      const signature = headers.get("x-hub-signature-256")
      if (!signature?.startsWith("sha256=")) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Missing GitHub signature", 400)
      const bytes = fromHex(signature.slice("sha256=".length))
      if (!bytes) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid GitHub signature", 400)
      const key = await keyPromise
      if (!await crypto.subtle.verify("HMAC", key, bytes as BufferSource, rawBody as BufferSource)) {
        throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid GitHub signature", 400)
      }
    },
    async parse({ rawBody, text, headers }): Promise<ParseResult<GitHubEvents>> {
      // Only large bodies provide enough parsing work to benefit from speculative hashing.
      const digestPromise = rawBody.byteLength >= 65_536
        ? crypto.subtle.digest("SHA-256", rawBody as BufferSource) : undefined
      try {
        const payload: unknown = JSON.parse(text)
        if (!isRecord(payload)) throw new Error("Invalid JSON")
        const event = headers.get("x-github-event")
        const action = payload.action
        let eventName: keyof GitHubEvents | undefined
        if (event === "push" || event === "ping" || event === "create" || event === "delete") eventName = event
        else if (typeof action === "string") {
          const candidate = `${event}.${action}` as keyof GitHubEvents
          if (ACTION_EVENTS.includes(candidate)) eventName = candidate
        }
        if (!eventName) return { kind: "unsupported", nativeEventName: event ?? undefined }
        if (allowedEvents && !allowedEvents.has(eventName)) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "GitHub event is not allowed", 400)
        validatePayload(eventName, payload)
        if (allowedRepositories && (!isRecord(payload.repository) || !allowedRepositories.has(String(payload.repository.full_name)))) {
          throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "GitHub repository is not allowed", 400)
        }
        // GitHub delivery/event headers are unsigned. Bind deduplication to authenticated bytes.
        const digest = await (digestPromise ?? crypto.subtle.digest("SHA-256", rawBody as BufferSource))
        const id = `body:${hex(new Uint8Array(digest))}`
        return { kind: "supported", eventName, event: payload, id } as SupportedParseResult<GitHubEvents>
      } finally {
        // A rejected or unsupported payload may not await speculative hashing.
        // Preserve its parse result/error while settling any started operation.
        if (digestPromise) await Promise.allSettled([digestPromise])
      }
    },
  })
}
