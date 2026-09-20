import { describe, expect, it } from "vitest"
import { defineProvider, Hibiki, type ParseResult } from "@hibiki-js/core"
import { createWebhookTest, githubRequest, stripeRequest } from "../src/index.js"

interface Events { ping: { ok: true } }
const example = defineProvider<"example", Events>({
  name: "example",
  async verify() {},
  async parse(): Promise<ParseResult<Events>> {
    return { kind: "supported", eventName: "ping", event: { ok: true } }
  },
})

describe("testing helpers", () => {
  it("builds signed stripe and github requests", async () => {
    const stripe = await stripeRequest({ type: "invoice.paid" }, "secret", 1_700_000_000)
    expect(stripe.headers.get("stripe-signature")).toContain("t=1700000000")

    const github = await githubRequest({ ref: "main" }, "push", "secret")
    expect(github.headers.get("x-github-event")).toBe("push")
    expect(github.headers.get("x-hub-signature-256")).toMatch(/^sha256=/)
  })

  it("emitEvent rejects missing secrets and unsupported providers", async () => {
    const app = new Hibiki().use(example)
    const webhook = createWebhookTest(app)
    await expect(webhook.emitEvent("example.ping" as never, {})).rejects.toThrow(/Missing secret/)

    const withSecret = createWebhookTest(app, { secrets: { example: "secret" } })
    await expect(withSecret.emitEvent("example.ping" as never, {})).rejects.toThrow(/No signed-request helper/)
    await expect(withSecret.emitEvent("bad" as never, {})).rejects.toThrow(/Invalid event name/)
  })

  it("emit forwards raw requests", async () => {
    const app = new Hibiki().use(example)
    app.on("example.ping", () => new Response("pong"))
    const webhook = createWebhookTest(app)
    const response = await webhook.emit(new Request("https://test", { method: "POST", body: "{}" }), "example")
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("pong")
  })
})
