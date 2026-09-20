import { defineProvider, HibikiError, type HibikiProvider, type ParseResult } from "@hibiki-js/core"

interface Repository { full_name: string; [key: string]: unknown }
export interface GitHubEvents {
  push: { ref: string; repository: Repository; [key: string]: unknown }
  "pull_request.opened": { action: "opened"; pull_request: { number: number; [key: string]: unknown }; repository: Repository }
  "pull_request.closed": { action: "closed"; pull_request: { number: number; [key: string]: unknown }; repository: Repository }
  "issues.opened": { action: "opened"; issue: { number: number; [key: string]: unknown }; repository: Repository }
}
export interface GitHubOptions { secret: string }

const encoder = new TextEncoder()

function fromHex(value: string): Uint8Array | undefined {
  if (value.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    const nibble = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(nibble)) return undefined
    bytes[i] = nibble
  }
  return bytes
}

/** Create a GitHub JSON webhook provider without Octokit. */
export function github(options: GitHubOptions): HibikiProvider<"github", GitHubEvents> {
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
    async parse({ text, headers }): Promise<ParseResult<GitHubEvents>> {
      const payload: unknown = JSON.parse(text)
      if (!payload || typeof payload !== "object") throw new Error("Invalid JSON")
      const event = headers.get("x-github-event")
      const action = (payload as { action?: unknown }).action
      if (event === "push") return { kind: "supported", eventName: "push", event: payload as GitHubEvents["push"] }
      if (event === "pull_request" && action === "opened") return { kind: "supported", eventName: "pull_request.opened", event: payload as GitHubEvents["pull_request.opened"] }
      if (event === "pull_request" && action === "closed") return { kind: "supported", eventName: "pull_request.closed", event: payload as GitHubEvents["pull_request.closed"] }
      if (event === "issues" && action === "opened") return { kind: "supported", eventName: "issues.opened", event: payload as GitHubEvents["issues.opened"] }
      return { kind: "unsupported", nativeEventName: event ?? undefined }
    },
  })
}
