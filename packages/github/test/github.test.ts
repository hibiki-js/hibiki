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
