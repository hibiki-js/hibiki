import type { GitHubEvents } from "./types.js"

export const ACTION_EVENTS: readonly (keyof GitHubEvents)[] = [
  "pull_request.opened",
  "pull_request.closed",
  "pull_request.reopened",
  "pull_request.synchronize",
  "pull_request.ready_for_review",
  "pull_request.labeled",
  "pull_request_review.submitted",
  "issues.opened",
  "issues.closed",
  "issues.reopened",
  "issue_comment.created",
  "release.published",
  "workflow_run.completed",
  "workflow_job.completed",
  "check_suite.completed",
  "check_run.completed",
  "deployment.created",
  "deployment_status.created",
]

// Annotate both calls so syntax minification preserves sender-only tree shaking.
/** Native events/actions supported by this release. */
export const githubEvents: readonly (keyof GitHubEvents)[] = /* @__PURE__ */ Object.freeze(
  /* @__PURE__ */ (["push", "ping", "create", "delete"] as (keyof GitHubEvents)[]).concat(ACTION_EVENTS),
)
