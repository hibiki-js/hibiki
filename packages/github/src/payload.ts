import type { GitHubEvents } from "./types.js"

/** Accept JSON objects while excluding null and arrays. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/** Check required fields before exposing typed events to handlers. */
export function validatePayload(eventName: keyof GitHubEvents, payload: Record<string, unknown>): void {
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
