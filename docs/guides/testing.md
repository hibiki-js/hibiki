# Testing

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { createWebhookTest } from "@hibiki-js/testing"

const app = new Hibiki().use(stripe({ secret: "whsec_test" }))
app.on("stripe.checkout.session.completed", ({ event }) => {
  console.log(event.data.object.id)
})

const webhook = createWebhookTest(app, { secrets: { stripe: "whsec_test" } })
await webhook.emitEvent("stripe.checkout.session.completed", {
  id: "cs_test",
  object: "checkout.session",
})
```

Low-level helpers `stripeRequest` and `githubRequest` are also available when you need full control over headers and timestamps.
