import { defineProvider, HibikiError, type HibikiProvider, type ParseResult, type SupportedParseResult } from "@hibiki-js/core"

interface Repository { full_name: string; [key: string]: unknown }
interface PullRequest { number: number; [key: string]: unknown }
interface Issue { number: number; [key: string]: unknown }
interface Comment { id: number; body?: string; [key: string]: unknown }
interface Review { id: number; state: string; [key: string]: unknown }
interface Label { name: string; [key: string]: unknown }
interface Release { tag_name: string; [key: string]: unknown }
interface WorkflowRun { id: number; conclusion: string | null; [key: string]: unknown }
interface WorkflowJob { id: number; conclusion: string | null; [key: string]: unknown }
interface CheckSuite { id: number; conclusion: string | null; [key: string]: unknown }
interface CheckRun { id: number; conclusion: string | null; [key: string]: unknown }
interface Deployment { id: number; environment: string; [key: string]: unknown }
interface DeploymentStatus { id: number; state: string; [key: string]: unknown }

export interface GitHubEvents {
  push: { ref: string; repository: Repository; [key: string]: unknown }
  ping: { zen: string; hook_id?: number; [key: string]: unknown }
  "pull_request.opened": { action: "opened"; pull_request: PullRequest; repository: Repository }
  "pull_request.closed": { action: "closed"; pull_request: PullRequest; repository: Repository }
  "pull_request.reopened": { action: "reopened"; pull_request: PullRequest; repository: Repository }
  "pull_request.synchronize": { action: "synchronize"; pull_request: PullRequest; repository: Repository }
  "pull_request.ready_for_review": { action: "ready_for_review"; pull_request: PullRequest; repository: Repository }
  "pull_request.labeled": { action: "labeled"; pull_request: PullRequest; label: Label; repository: Repository }
  "pull_request_review.submitted": { action: "submitted"; review: Review; pull_request: PullRequest; repository: Repository }
  "issues.opened": { action: "opened"; issue: Issue; repository: Repository }
  "issues.closed": { action: "closed"; issue: Issue; repository: Repository }
  "issues.reopened": { action: "reopened"; issue: Issue; repository: Repository }
  "issue_comment.created": { action: "created"; comment: Comment; issue: Issue; repository: Repository }
  "release.published": { action: "published"; release: Release; repository: Repository }
  "workflow_run.completed": { action: "completed"; workflow_run: WorkflowRun; repository: Repository }
  "workflow_job.completed": { action: "completed"; workflow_job: WorkflowJob; repository: Repository }
  "check_suite.completed": { action: "completed"; check_suite: CheckSuite; repository: Repository }
  "check_run.completed": { action: "completed"; check_run: CheckRun; repository: Repository }
  "deployment.created": { action: "created"; deployment: Deployment; repository: Repository }
  "deployment_status.created": { action: "created"; deployment_status: DeploymentStatus; deployment: Deployment; repository: Repository }
  create: { ref: string; ref_type: string; repository: Repository; [key: string]: unknown }
  delete: { ref: string; ref_type: string; repository: Repository; [key: string]: unknown }
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

type ActionEvent =
  | ["pull_request", "opened" | "closed" | "reopened" | "synchronize" | "ready_for_review" | "labeled", keyof GitHubEvents]
  | ["pull_request_review", "submitted", keyof GitHubEvents]
  | ["issues", "opened" | "closed" | "reopened", keyof GitHubEvents]
  | ["issue_comment", "created", keyof GitHubEvents]
  | ["release", "published", keyof GitHubEvents]
  | ["workflow_run", "completed", keyof GitHubEvents]
  | ["workflow_job", "completed", keyof GitHubEvents]
  | ["check_suite", "completed", keyof GitHubEvents]
  | ["check_run", "completed", keyof GitHubEvents]
  | ["deployment", "created", keyof GitHubEvents]
  | ["deployment_status", "created", keyof GitHubEvents]

const ACTION_EVENTS: ActionEvent[] = [
  ["pull_request", "opened", "pull_request.opened"],
  ["pull_request", "closed", "pull_request.closed"],
  ["pull_request", "reopened", "pull_request.reopened"],
  ["pull_request", "synchronize", "pull_request.synchronize"],
  ["pull_request", "ready_for_review", "pull_request.ready_for_review"],
  ["pull_request", "labeled", "pull_request.labeled"],
  ["pull_request_review", "submitted", "pull_request_review.submitted"],
  ["issues", "opened", "issues.opened"],
  ["issues", "closed", "issues.closed"],
  ["issues", "reopened", "issues.reopened"],
  ["issue_comment", "created", "issue_comment.created"],
  ["release", "published", "release.published"],
  ["workflow_run", "completed", "workflow_run.completed"],
  ["workflow_job", "completed", "workflow_job.completed"],
  ["check_suite", "completed", "check_suite.completed"],
  ["check_run", "completed", "check_run.completed"],
  ["deployment", "created", "deployment.created"],
  ["deployment_status", "created", "deployment_status.created"],
]

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
      if (event === "ping") return { kind: "supported", eventName: "ping", event: payload as GitHubEvents["ping"] }
      if (event === "create") return { kind: "supported", eventName: "create", event: payload as GitHubEvents["create"] }
      if (event === "delete") return { kind: "supported", eventName: "delete", event: payload as GitHubEvents["delete"] }
      for (const [name, expectedAction, eventName] of ACTION_EVENTS) {
        if (event === name && action === expectedAction) {
          return {
            kind: "supported",
            eventName,
            event: payload as GitHubEvents[typeof eventName],
          } as SupportedParseResult<GitHubEvents>
        }
      }
      return { kind: "unsupported", nativeEventName: event ?? undefined }
    },
  })
}
