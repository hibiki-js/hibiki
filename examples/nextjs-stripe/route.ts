import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const webhooks = new Hibiki().use(stripe({ secret: "whsec_example" }))
webhooks.on("stripe.payment_intent.succeeded", async ({ event }) => {
  console.log(event.data.object.id)
})

/** Next.js Route Handler: no framework adapter is needed. */
export const POST = (request: Request) => webhooks.handle(request, { provider: "stripe" })
