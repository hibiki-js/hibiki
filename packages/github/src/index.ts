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
export interface GitHubOptions {
  secret: string
  /** Restrict this endpoint to the native/action event names it needs. */
  allowedEvents?: readonly (keyof GitHubEvents)[]
  /** Restrict signed deliveries to these repository full names. */
  allowedRepositories?: readonly string[]
}

export interface GitHubWebhookSenderOptions {
  /** Signing secret shared with the webhook receiver. */
  secret: string
  /** Override global fetch, for example when running in a custom runtime. */
  fetch?: typeof fetch
}

export interface GitHubWebhookSender {
  send<TEvent extends keyof GitHubEvents>(eventName: TEvent, payload: GitHubEvents[TEvent]): Promise<Response>
}

/** Create a client that sends GitHub-compatible, signed webhook deliveries to a URL. */
export function createGitHubWebhook(url: string, options: GitHubWebhookSenderOptions): GitHubWebhookSender {
  const endpoint = new URL(url)
  const fetcher = options.fetch ?? fetch
  if (typeof options.secret !== "string" || !options.secret.trim()) throw new TypeError("Webhook secret must be a non-empty string")
  const keyPromise = crypto.subtle.importKey("raw", encoder.encode(options.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])

  return {
    async send<TEvent extends keyof GitHubEvents>(eventName: TEvent, payload: GitHubEvents[TEvent]): Promise<Response> {
      const body = JSON.stringify(payload)
      const key = await keyPromise
      const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body) as BufferSource)), byte => byte.toString(16).padStart(2, "0")).join("")
      const nativeEventName = String(eventName).split(".", 1)[0]!

      let response: Response
      try {
        response = await fetcher(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            "content-type": "application/json",
            "x-github-event": nativeEventName,
            "x-hub-signature-256": `sha256=${signature}`,
          },
          body,
        })
      } catch (error) {
        throw new Error("GitHub webhook request failed", { cause: error })
      }
      if (!response.ok) throw new Error(`GitHub webhook request failed (${response.status})`)
      return response
    },
  }
}

const encoder = new TextEncoder()

/** Decode exactly one SHA-256 digest; reject malformed signature encodings. */
function fromHex(value: string): Uint8Array | undefined {
  if (!/^[0-9a-f]{64}$/i.test(value)) return undefined
  const bytes = new Uint8Array(value.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16)
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

/** Accept JSON objects while excluding null and arrays. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** Check required fields before exposing typed events to handlers. */
function validatePayload(eventName: keyof GitHubEvents, payload: Record<string, unknown>): void {
  /** Check a required string property on a JSON object. */
  const stringField = (object: unknown, key: string) => isRecord(object) && typeof object[key] === "string"
  /** Check a required integer ID or issue number on a JSON object. */
  const numberField = (object: unknown, key: string) => isRecord(object) && Number.isSafeInteger(object[key])
  let valid = eventName === "ping" ? stringField(payload, "zen") : stringField(payload.repository, "full_name")
  const name = eventName.split(".", 1)[0]
  if (name === "push") valid &&= stringField(payload, "ref") && !Object.hasOwn(payload, "ref_type") && !Object.hasOwn(payload, "action")
  else if (name === "create" || name === "delete") valid &&= stringField(payload, "ref") && (payload.ref_type === "branch" || payload.ref_type === "tag") && !Object.hasOwn(payload, "action")
  else if (name === "pull_request") {
    valid &&= numberField(payload.pull_request, "number")
    if (eventName === "pull_request.labeled") valid &&= stringField(payload.label, "name")
  } else if (name === "pull_request_review") valid &&= numberField(payload.pull_request, "number") && numberField(payload.review, "id") && stringField(payload.review, "state")
  else if (name === "issues") valid &&= numberField(payload.issue, "number")
  else if (name === "issue_comment") valid &&= numberField(payload.issue, "number") && numberField(payload.comment, "id")
  else if (name === "release") valid &&= stringField(payload.release, "tag_name")
  else if (name === "workflow_run" || name === "workflow_job" || name === "check_suite" || name === "check_run") {
    const resource = payload[name]
    valid &&= numberField(resource, "id") && isRecord(resource) && (resource.conclusion === null || typeof resource.conclusion === "string")
  } else if (name === "deployment" || name === "deployment_status") {
    valid &&= numberField(payload.deployment, "id") && stringField(payload.deployment, "environment")
    if (name === "deployment_status") valid &&= numberField(payload.deployment_status, "id") && stringField(payload.deployment_status, "state")
  }
  if (!valid) throw new Error("GitHub payload does not match the event")
}

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
      const payload: unknown = JSON.parse(text)
      if (!isRecord(payload)) throw new Error("Invalid JSON")
      const event = headers.get("x-github-event")
      const action = payload.action
      let eventName: keyof GitHubEvents | undefined
      if (event === "push" || event === "ping" || event === "create" || event === "delete") eventName = event
      else eventName = ACTION_EVENTS.find(([name, expectedAction]) => event === name && action === expectedAction)?.[2]
      if (!eventName) return { kind: "unsupported", nativeEventName: event ?? undefined }
      if (allowedEvents && !allowedEvents.has(eventName)) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "GitHub event is not allowed", 400)
      validatePayload(eventName, payload)
      if (allowedRepositories && (!isRecord(payload.repository) || !allowedRepositories.has(String(payload.repository.full_name)))) {
        throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "GitHub repository is not allowed", 400)
      }
      // GitHub delivery/event headers are unsigned. Bind deduplication to authenticated bytes.
      const digest = await crypto.subtle.digest("SHA-256", rawBody as BufferSource)
      const id = `body:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`
      return { kind: "supported", eventName, event: payload, id } as SupportedParseResult<GitHubEvents>
    },
  })
}
