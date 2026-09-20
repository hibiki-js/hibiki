import { describe, expect, it } from "vitest"
import { Hono } from "hono"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { hibiki } from "../src/index.js"
import { stripeRequest } from "@hibiki-js/testing"

describe("Hono adapter", () => {
  it("forwards verified Stripe requests to Hibiki", async () => {
    const webhooks = new Hibiki().use(stripe({ secret: "secret" }))
    let seen = ""
    webhooks.on("stripe.invoice.paid", ({ event }) => { seen = event.data.object.id })
    const app = new Hono().post("/webhooks/stripe", hibiki(webhooks, "stripe"))
    const request = await stripeRequest({ id: "evt_1", type: "invoice.paid", data: { object: { id: "in_1", object: "invoice" } } }, "secret")
    const response = await app.request("https://hibiki.test/webhooks/stripe", request)
    expect(response.status).toBe(204)
    expect(seen).toBe("in_1")
  })
})
