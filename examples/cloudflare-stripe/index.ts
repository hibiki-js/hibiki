import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const webhooks = new Hibiki().use(stripe({ secret: "whsec_example" }))
webhooks.on("stripe.invoice.paid", ({ event, waitUntil }) => {
  waitUntil?.(Promise.resolve(console.log(event.data.object.id)))
})

export default {
  fetch(request: Request, _env: unknown, ctx: { waitUntil(promise: Promise<unknown>): void }) {
    return webhooks.handle(request, { provider: "stripe", waitUntil: ctx.waitUntil.bind(ctx) })
  },
}
