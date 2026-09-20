import { Hono } from "hono"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { hibiki } from "@hibiki-js/hono"

const webhooks = new Hibiki().use(stripe({ secret: "whsec_example" }))
webhooks.on("stripe.checkout.session.completed", async (context) => {
  console.log(context.event.data.object.id)
})
export const app = new Hono().post("/webhooks/stripe", hibiki(webhooks, "stripe"))
