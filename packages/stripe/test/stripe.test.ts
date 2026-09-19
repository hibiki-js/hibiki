import { describe, expect, it } from "vitest"
import { Hibiki } from "@hibiki/core"
import { stripe } from "../src/index.js"
import { stripeRequest } from "@hibiki/testing"

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
})
