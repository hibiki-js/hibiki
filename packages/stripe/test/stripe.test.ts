import { describe, expect, expectTypeOf, it } from "vitest"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "../src/index.js"
import { createWebhookTest, stripeRequest } from "@hibiki-js/testing"

describe("Stripe provider", () => {
  it("accepts a signed supported event", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret" }))
    let seen = ""
    app.on("stripe.checkout.session.completed", ({ event }) => { seen = event.data.object.id })
    const response = await app.handle(await stripeRequest({ id: "evt_1", type: "checkout.session.completed", data: { object: { id: "cs_1", object: "checkout.session" } } }, "secret"), { provider: "stripe" })
    expect(response.status).toBe(204); expect(seen).toBe("cs_1")
  })

  it("rejects an invalid signature", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret" }))
    const request = await stripeRequest({ type: "invoice.paid" }, "wrong")
    expect((await app.handle(request, { provider: "stripe" })).status).toBe(400)
  })

  it("rejects expired signatures outside tolerance", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret", tolerance: 60 }))
    const stale = Math.floor(Date.now() / 1000) - 120
    const request = await stripeRequest({ id: "evt_2", type: "invoice.paid", data: { object: { id: "in_1", object: "invoice" } } }, "secret", stale)
    expect((await app.handle(request, { provider: "stripe" })).status).toBe(400)
  })

  it("rejects missing signature headers", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret" }))
    const response = await app.handle(new Request("https://hibiki.test/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "invoice.paid" }),
    }), { provider: "stripe" })
    expect(response.status).toBe(400)
    expect(await response.text()).toBe("HIBIKI_VERIFICATION_FAILED")
  })

  it("accepts a fixed Stripe-compatible HMAC test vector", async () => {
    // Stripe signs `${t}.${rawBody}` with HMAC-SHA256. This locks that exact scheme.
    const secret = "whsec_test_vector"
    const timestamp = 1_700_000_000
    const payload = { id: "evt_vector", type: "invoice.paid", data: { object: { id: "in_vector", object: "invoice" } } }
    const app = new Hibiki().use(stripe({ secret, tolerance: timestamp }))
    let seen = ""
    app.on("stripe.invoice.paid", ({ event }) => { seen = event.data.object.id })
    const response = await app.handle(await stripeRequest(payload, secret, timestamp), { provider: "stripe" })
    expect(response.status).toBe(204)
    expect(seen).toBe("in_vector")
  })

  it("returns 200 for unsupported Stripe events by default", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret" }))
    const response = await app.handle(await stripeRequest({ id: "evt_3", type: "customer.created", data: { object: { id: "cus_1" } } }, "secret"), { provider: "stripe" })
    expect(response.status).toBe(200)
  })

  it("supports emitEvent helpers and narrows checkout session types", async () => {
    const app = new Hibiki().use(stripe({ secret: "whsec_test" }))
    app.on("stripe.payment_intent.succeeded", ({ event }) => {
      expectTypeOf(event.data.object.id).toEqualTypeOf<string>()
      expectTypeOf(event.type).toEqualTypeOf<"payment_intent.succeeded">()
    })
    const webhook = createWebhookTest(app, { secrets: { stripe: "whsec_test" } })
    const response = await webhook.emitEvent("stripe.payment_intent.succeeded", { id: "pi_1", object: "payment_intent" })
    expect(response.status).toBe(204)

    const typed = await webhook.emitEvent("stripe.invoice.paid", {
      id: "evt_typed",
      type: "invoice.paid",
      data: { object: { id: "in_typed", object: "invoice" } },
    })
    expect(typed.status).toBe(204)
  })
})
