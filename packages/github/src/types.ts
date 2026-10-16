export interface GitHubUser { login: string; id?: number; [key: string]: unknown }
export interface Repository { full_name: string; name?: string; html_url?: string; private?: boolean; [key: string]: unknown }
export interface PullRequest {
  number: number
  title?: string
  body?: string | null
  state?: "open" | "closed"
  merged?: boolean | null
  html_url?: string
  user?: GitHubUser
  head?: { ref: string; sha: string; [key: string]: unknown }
  base?: { ref: string; sha: string; [key: string]: unknown }
  [key: string]: unknown
}
export interface Issue {
  number: number
  title?: string
  body?: string | null
  state?: "open" | "closed"
  html_url?: string
  user?: GitHubUser
  labels?: Label[]
  [key: string]: unknown
}
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
