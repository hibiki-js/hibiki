// Deterministic integration fixture for runner self-checks. This is not a model eval.
import { writeFile } from "node:fs/promises"
await writeFile("app.ts", `import { Hono } from 'hono'
import { Hibiki } from '@hibiki-js/core'
import { stripe } from '@hibiki-js/stripe'
import { github } from '@hibiki-js/github'
import { hibiki } from '@hibiki-js/hono'
import type { Config } from './contract.js'
export function createApp(config: Config) {
  const webhooks = new Hibiki().use(stripe({secret:config.stripeSecret})).use(github({secret:config.githubSecret}))
  webhooks.on('stripe.checkout.session.completed', async ({event}) => {
    const session = event.data.object
    if (session.payment_status === 'paid' && session.metadata?.order_id && typeof session.amount_total === 'number') await config.onPaid({sessionId:session.id,orderId:session.metadata.order_id,amount:session.amount_total})
  })
  webhooks.on('github.issues.opened', async ({event}) => {
    if (typeof event.issue.title === 'string') await config.onIssue({repository:event.repository.full_name,number:event.issue.number,title:event.issue.title})
  })
  return new Hono().get('/health', c => c.json({ok:true})).post('/webhooks/stripe',hibiki(webhooks,'stripe')).post('/webhooks/github',hibiki(webhooks,'github'))
}
`)
