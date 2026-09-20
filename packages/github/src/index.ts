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
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
const equal = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let value = 0; for (let i = 0; i < left.length; i++) value |= left.charCodeAt(i) ^ right.charCodeAt(i)
  return value === 0
}

/** Create a GitHub JSON webhook provider without Octokit. */
export function github(options: GitHubOptions): HibikiProvider<"github", GitHubEvents> {
  return defineProvider<"github", GitHubEvents>({
    name: "github", contentTypes: ["application/json"],
    async verify({ rawBody, headers }) {
      const signature = headers.get("x-hub-signature-256")
      if (!signature?.startsWith("sha256=")) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Missing GitHub signature", 400)
      const key = await crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      const expected = `sha256=${hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody as unknown as BufferSource)))}`
      if (!equal(expected, signature)) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid GitHub signature", 400)
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
