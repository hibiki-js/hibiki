import { describe, expect, it } from "vitest"
import { defineProvider, Hibiki, type ParseResult } from "@hibiki-js/core"
import { createWebhookTest, githubRequest, stripeRequest } from "../src/index.js"
import { stripe } from "@hibiki-js/stripe"
import { github } from "@hibiki-js/github"

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

  it("checks typed payloads and verifies the intended side effects", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret" })).use(github({ secret: "github-secret" }))
    const seen: string[] = []
    app.on("stripe.checkout.session.completed", ({ event }) => {
      if (event.data.object.payment_status === "paid") seen.push(event.data.object.id)
    })
    app.on("github.issues.opened", ({ event }) => { seen.push(event.issue.title ?? "untitled") })
    const webhook = createWebhookTest(app, { secrets: { stripe: "secret", github: "github-secret" } })
    expect((await webhook.emitTypedEvent("stripe.checkout.session.completed", {
      id: "evt_1", type: "checkout.session.completed",
      data: { object: { id: "cs_1", object: "checkout.session", payment_status: "paid", amount_total: 1200 } },
    })).status).toBe(204)
    expect((await webhook.emitTypedEvent("github.issues.opened", {
      action: "opened", issue: { number: 1, title: "Fix billing" }, repository: { full_name: "acme/app" },
    })).status).toBe(204)
    expect(seen).toEqual(["cs_1", "Fix billing"])
    // These checks must compile without executing deliberately invalid fixtures.
    if (false) {
      // @ts-expect-error a different event envelope cannot widen the selected event name
      webhook.emitTypedEvent("stripe.checkout.session.completed", { id: "evt", type: "invoice.paid", data: { object: { id: "in", object: "invoice" } } })
      // @ts-expect-error the checkout amount is numeric
      webhook.emitTypedEvent("stripe.checkout.session.completed", { id: "evt", type: "checkout.session.completed", data: { object: { id: "cs", object: "checkout.session", amount_total: "1200" } } })
      // @ts-expect-error action and event name must agree
      webhook.emitTypedEvent("github.issues.opened", { action: "closed", issue: { number: 1 }, repository: { full_name: "a/b" } })
      // @ts-expect-error a complete payload includes the repository
      webhook.emitTypedEvent("github.push", { ref: "main" })
    }
    await expect(webhook.emitTypedEvent("stripe.checkout.session.completed", { type: "invoice.paid" } as never)).rejects.toThrow(/Payload type/)
    await expect(webhook.emitTypedEvent("github.issues.opened", { action: "closed" } as never)).rejects.toThrow(/Payload action/)
  })

  it("can exercise wrong secrets, expiry, and body tampering without calling handlers", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret" }))
    let calls = 0
    app.on("stripe.invoice.paid", () => { calls++ })
    const webhook = createWebhookTest(app, { secrets: { stripe: "secret" } })
    for (const options of [{ secret: "wrong" }, { timestamp: Math.floor(Date.now() / 1000) - 301 }]) {
      const response = await webhook.emitEvent("stripe.invoice.paid", { id: "in_1", object: "invoice" }, options)
      expect(response.status).toBe(400)
      expect(await response.text()).toBe("HIBIKI_VERIFICATION_FAILED")
    }
    const valid = await webhook.requestEvent("stripe.invoice.paid", { id: "in_1", object: "invoice" })
    const tampered = new Request(valid.url, { method: "POST", headers: valid.headers, body: (await valid.text()).replace("in_1", "in_2") })
    expect((await webhook.emit(tampered, "stripe")).status).toBe(400)
    expect(calls).toBe(0)
    expect((await webhook.emitEvent("stripe.invoice.paid", { id: "in_1", object: "invoice" })).status).toBe(204)
    expect(calls).toBe(1)
  })

  it("does not silently ignore Stripe-only request options on GitHub", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    await expect(createWebhookTest(app, { secrets: { github: "secret" } }).requestEvent("github.push", {}, { timestamp: 1 })).rejects.toThrow(/only for Stripe/)
  })
})
