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
  })
})
