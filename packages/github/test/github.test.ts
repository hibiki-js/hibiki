import { describe, expect, expectTypeOf, it } from "vitest"
import { Hibiki } from "@hibiki-js/core"
import { github } from "../src/index.js"
import { createWebhookTest, githubRequest } from "@hibiki-js/testing"

describe("GitHub provider", () => {
  it("routes action-level events", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    let number = 0
    app.on("github.pull_request.opened", ({ event }) => { number = event.pull_request.number })
    const response = await app.handle(await githubRequest({ action: "opened", pull_request: { number: 42 }, repository: { full_name: "hibiki/repo" } }, "pull_request", "secret"), { provider: "github" })
    expect(response.status).toBe(204); expect(number).toBe(42)
  })

  it("returns 415 for signed non-JSON payloads", async () => {
    const app = new Hibiki({ strictEvents: true }).use(github({ secret: "secret" }))
    const response = await app.handle(await githubRequest({ ref: "main" }, "push", "secret", "application/x-www-form-urlencoded"), { provider: "github" })
    expect(response.status).toBe(415)
    expect(await response.text()).toBe("HIBIKI_UNSUPPORTED_CONTENT_TYPE")
  })

  it("rejects invalid signatures", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    const request = await githubRequest({ ref: "refs/heads/main", repository: { full_name: "hibiki/repo" } }, "push", "wrong")
    expect((await app.handle(request, { provider: "github" })).status).toBe(400)
  })

  it("rejects malformed GitHub signature hex", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    const response = await app.handle(new Request("https://hibiki.test/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": "sha256=abc",
      },
      body: JSON.stringify({ ref: "main", repository: { full_name: "hibiki/repo" } }),
    }), { provider: "github" })
    expect(response.status).toBe(400)
    expect(await response.text()).toBe("HIBIKI_VERIFICATION_FAILED")
  })

  it("routes pull_request.closed and issues.opened", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    let pr = 0
    let issue = 0
    app.on("github.pull_request.closed", ({ event }) => { pr = event.pull_request.number })
    app.on("github.issues.opened", ({ event }) => { issue = event.issue.number })
    expect((await app.handle(await githubRequest({ action: "closed", pull_request: { number: 9 }, repository: { full_name: "hibiki/repo" } }, "pull_request", "secret"), { provider: "github" })).status).toBe(204)
    expect(pr).toBe(9)
    expect((await app.handle(await githubRequest({ action: "opened", issue: { number: 3 }, repository: { full_name: "hibiki/repo" } }, "issues", "secret"), { provider: "github" })).status).toBe(204)
    expect(issue).toBe(3)
  })

  it("routes release, workflow_run, and ref create events", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    const seen: string[] = []
    app.on("github.release.published", () => { seen.push("release.published") })
    app.on("github.workflow_run.completed", ({ event }) => { seen.push(event.action) })
    app.on("github.create", ({ event }) => { seen.push(event.ref_type) })
    const webhook = createWebhookTest(app, { secrets: { github: "secret" } })
    expect((await webhook.emitEvent("github.release.published", { action: "published", release: { tag_name: "v1" }, repository: { full_name: "hibiki/repo" } })).status).toBe(204)
    expect((await webhook.emitEvent("github.workflow_run.completed", { action: "completed", workflow_run: { id: 1, conclusion: "success" }, repository: { full_name: "hibiki/repo" } })).status).toBe(204)
    expect((await webhook.emitEvent("github.create", { ref: "feature", ref_type: "branch", repository: { full_name: "hibiki/repo" } })).status).toBe(204)
    expect(seen).toEqual(["release.published", "completed", "branch"])
  })

  it("routes high-demand review, CI, PR, and deployment events", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    const seen: string[] = []
    app.on("github.pull_request_review.submitted", ({ event }) => { seen.push(event.review.state) })
    app.on("github.check_run.completed", ({ event }) => { seen.push(event.check_run.conclusion ?? "null") })
    app.on("github.pull_request.ready_for_review", ({ event }) => { seen.push(`ready:${event.pull_request.number}`) })
    app.on("github.pull_request.labeled", ({ event }) => { seen.push(event.label.name) })
    app.on("github.workflow_job.completed", ({ event }) => { seen.push(`job:${event.workflow_job.id}`) })
    app.on("github.deployment.created", ({ event }) => { seen.push(event.deployment.environment) })
    app.on("github.deployment_status.created", ({ event }) => { seen.push(event.deployment_status.state) })
    app.on("github.ping", ({ event }) => { seen.push(event.zen) })
    const webhook = createWebhookTest(app, { secrets: { github: "secret" } })
    expect((await webhook.emitEvent("github.pull_request_review.submitted", {
      review: { id: 1, state: "approved" },
      pull_request: { number: 10 },
      repository: { full_name: "hibiki/repo" },
    })).status).toBe(204)
    expect((await webhook.emitEvent("github.check_run.completed", {
      check_run: { id: 2, conclusion: "success" },
      repository: { full_name: "hibiki/repo" },
    })).status).toBe(204)
    expect((await webhook.emitEvent("github.pull_request.ready_for_review", {
      pull_request: { number: 11 },
      repository: { full_name: "hibiki/repo" },
    })).status).toBe(204)
    expect((await webhook.emitEvent("github.pull_request.labeled", {
      pull_request: { number: 12 },
      label: { name: "ready" },
      repository: { full_name: "hibiki/repo" },
    })).status).toBe(204)
    expect((await webhook.emitEvent("github.workflow_job.completed", {
      workflow_job: { id: 3, conclusion: "success" },
      repository: { full_name: "hibiki/repo" },
    })).status).toBe(204)
    expect((await webhook.emitEvent("github.deployment.created", {
      deployment: { id: 4, environment: "production" },
      repository: { full_name: "hibiki/repo" },
    })).status).toBe(204)
    expect((await webhook.emitEvent("github.deployment_status.created", {
      deployment_status: { id: 5, state: "success" },
      deployment: { id: 4, environment: "production" },
      repository: { full_name: "hibiki/repo" },
    })).status).toBe(204)
    expect((await webhook.emitEvent("github.ping", { zen: "Keep it logically awesome." })).status).toBe(204)
    expect(seen).toEqual(["approved", "success", "ready:11", "ready", "job:3", "production", "success", "Keep it logically awesome."])
  })

  it("routes delete events and rejects non-object JSON payloads", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    let ref = ""
    app.on("github.delete", ({ event }) => { ref = event.ref })
    const webhook = createWebhookTest(app, { secrets: { github: "secret" } })
    expect((await webhook.emitEvent("github.delete", { ref: "old", ref_type: "branch", repository: { full_name: "hibiki/repo" } })).status).toBe(204)
    expect(ref).toBe("old")

    const invalid = await githubRequest(null, "push", "secret")
    expect(await (await app.handle(invalid, { provider: "github" })).text()).toBe("HIBIKI_PARSE_FAILED")
  })

  it("returns 200 for unsupported GitHub events by default", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    const response = await app.handle(await githubRequest({ action: "labeled", issue: { number: 1 }, repository: { full_name: "hibiki/repo" } }, "issues", "secret"), { provider: "github" })
    expect(response.status).toBe(200)
  })

  it("supports emitEvent helpers and narrows push payload types", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    let name = ""
    app.on("github.push", ({ event }) => {
      expectTypeOf(event.repository.full_name).toEqualTypeOf<string>()
      name = event.repository.full_name
    })
    const webhook = createWebhookTest(app, { secrets: { github: "secret" } })
    const response = await webhook.emitEvent("github.push", { ref: "refs/heads/main", repository: { full_name: "hibiki/repo" } })
    expect(response.status).toBe(204)
    expect(name).toBe("hibiki/repo")

    let number = 0
    app.on("github.pull_request.opened", ({ event }) => { number = event.pull_request.number })
    const opened = await webhook.emitEvent("github.pull_request.opened", {
      pull_request: { number: 7 },
      repository: { full_name: "hibiki/repo" },
    })
    expect(opened.status).toBe(204)
    expect(number).toBe(7)
  })
})
