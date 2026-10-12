import { describe, expect, it, vi } from "vitest"
import { createWebhookTest } from "@hibiki-js/testing"
import { createApp } from "./app.js"

describe("Hono webhook integration", () => {
  it("checks side effects through the real Hono routes, including a subsequent provider", async () => {
    const fulfillOrder = vi.fn(async () => {})
    const openIssue = vi.fn(async () => {})
    const secrets = { stripe: "stripe_test", github: "github_test" }
    const { app, webhooks } = createApp(secrets, { fulfillOrder, openIssue })
    const test = createWebhookTest(webhooks, { secrets })
    const session = { id: "cs_1", object: "checkout.session", payment_status: "paid", amount_total: 1200, metadata: { order_id: "order_1" } }
    const deliver = async (request: Request, provider: string) => app.request(new Request(`https://hibiki.test/webhooks/${provider}`, request))

    expect((await deliver(await test.requestEvent("stripe.checkout.session.completed", session), "stripe")).status).toBe(204)
    expect(fulfillOrder).toHaveBeenCalledExactlyOnceWith({ sessionId: "cs_1", orderId: "order_1", amount: 1200 })

    const issue = { number: 5, title: "Billing bug" }
    expect((await deliver(await test.requestEvent("github.issues.opened", { issue, repository: { full_name: "acme/app" } }), "github")).status).toBe(204)
    expect(openIssue).toHaveBeenCalledExactlyOnceWith({ number: 5, title: "Billing bug", repository: "acme/app" })

    // Adding GitHub must not break an existing Stripe route.
    expect((await deliver(await test.requestEvent("stripe.checkout.session.completed", { ...session, id: "cs_2" }), "stripe")).status).toBe(204)
    expect(fulfillOrder).toHaveBeenCalledTimes(2)
    const signed = await test.requestEvent("stripe.checkout.session.completed", session)
    const body = await signed.text()
    const tampered = new Request(signed.url, { method: "POST", headers: signed.headers, body: body.replace("1200", "9999") })
    expect((await deliver(tampered, "stripe")).status).toBe(400)
    expect((await deliver(await test.requestEvent("stripe.checkout.session.completed", session, { secret: "wrong" }), "stripe")).status).toBe(400)
    expect((await deliver(await test.requestEvent("stripe.checkout.session.completed", { ...session, payment_status: "unpaid" }), "stripe")).status).toBe(204)
    expect(fulfillOrder).toHaveBeenCalledTimes(2)
    expect((await app.request("/health")).status).toBe(200)
  })

  it("does not mistake an unhandled 204 for a successful side effect", async () => {
    const fulfillOrder = vi.fn(async () => {})
    const secrets = { stripe: "stripe_test", github: "github_test" }
    const { app, webhooks } = createApp(secrets, { fulfillOrder, openIssue: async () => {} })
    const request = await createWebhookTest(webhooks, { secrets }).requestEvent("stripe.invoice.paid", { id: "in_1", object: "invoice" })
    expect((await app.request(new Request("https://hibiki.test/webhooks/stripe", request))).status).toBe(204)
    expect(fulfillOrder).not.toHaveBeenCalled()
  })

  it("validates required business fields even on a correctly signed payload", async () => {
    const fulfillOrder = vi.fn(async () => {})
    const openIssue = vi.fn(async () => {})
    const secrets = { stripe: "stripe_test", github: "github_test" }
    const { app, webhooks } = createApp(secrets, { fulfillOrder, openIssue })
    const test = createWebhookTest(webhooks, { secrets })
    const stripeRequest = await test.requestEvent("stripe.checkout.session.completed", {
      id: "cs_1", object: "checkout.session", payment_status: "paid", amount_total: 1200, metadata: { order_id: 123 },
    })
    expect((await app.request(new Request("https://hibiki.test/webhooks/stripe", stripeRequest))).status).toBe(400)
    const githubRequest = await test.requestEvent("github.issues.opened", { issue: { number: "invalid", title: "Bug" }, repository: { full_name: "acme/app" } })
    expect((await app.request(new Request("https://hibiki.test/webhooks/github", githubRequest))).status).toBe(400)
    expect(fulfillOrder).not.toHaveBeenCalled(); expect(openIssue).not.toHaveBeenCalled()
  })
})
