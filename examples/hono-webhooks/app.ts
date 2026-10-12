import { Hono } from "hono"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { github } from "@hibiki-js/github"
import { hibiki } from "@hibiki-js/hono"

export interface WebhookServices {
  fulfillOrder(input: { sessionId: string; orderId: string; amount: number }): Promise<void>
  openIssue(input: { repository: string; number: number; title: string }): Promise<void>
}

/** Inject secrets and side effects; tests need neither provider accounts nor a server. */
export function createApp(secrets: { stripe: string; github: string }, services: WebhookServices) {
  const webhooks = new Hibiki()
    .use(stripe({ secret: secrets.stripe }))
    .use(github({ secret: secrets.github }))

  webhooks.on("stripe.checkout.session.completed", async ({ event }) => {
    const session = event.data?.object
    if (!session || typeof session !== "object") return new Response("Missing session", { status: 400 })
    if (session.payment_status !== "paid") return
    const orderId = session.metadata?.order_id
    if (typeof session.id !== "string" || !session.id || typeof orderId !== "string" || !orderId || typeof session.amount_total !== "number") {
      return new Response("Missing order data", { status: 400 })
    }
    await services.fulfillOrder({ sessionId: session.id, orderId, amount: session.amount_total })
  })
  webhooks.on("github.issues.opened", async ({ event }) => {
    if (typeof event.issue?.title !== "string" || typeof event.issue.number !== "number" || typeof event.repository?.full_name !== "string") {
      return new Response("Missing issue data", { status: 400 })
    }
    await services.openIssue({ repository: event.repository.full_name, number: event.issue.number, title: event.issue.title })
  })

  const app = new Hono()
    .get("/health", context => context.json({ ok: true }))
    .post("/webhooks/stripe", hibiki(webhooks, "stripe"))
    .post("/webhooks/github", hibiki(webhooks, "github"))

  return { app, webhooks }
}
