import { describe, expect, it } from "vitest"
import { Hibiki } from "@hibiki-js/core"
import { github } from "../src/index.js"
import { githubRequest } from "@hibiki-js/testing"

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
})
