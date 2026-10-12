// The behavioral contract is identical across framework choices.
export const contract = `export interface Config {
  stripeSecret: string
  githubSecret: string
  onPaid(input: { sessionId: string; orderId: string; amount: number }): Promise<void>
  onIssue(input: { repository: string; number: number; title: string }): Promise<void>
}
export interface App { fetch(request: Request): Response | Promise<Response> }
`

const base = `Implement a TypeScript HTTP webhook application in app.ts. Export createApp(config: Config): App using the interfaces in contract.ts (import './contract.js'). Return an object with fetch(Request): Response | Promise<Response>. Keep configuration and side effects injected; do not start a server. GET /health returns status 200 and JSON {"ok":true}. Unknown paths return 404. Write and run your own verification. Do not change contract.ts. Use the libraries you judge appropriate unless a dependency choice is specified below.`
const stripe = `POST /webhooks/stripe accepts Stripe snapshot checkout.session.completed events. Verify the original raw body with Stripe-Signature and config.stripeSecret, including a 300-second timestamp tolerance. Reject invalid, missing, tampered, or expired signatures with a 4xx status and no side effects. For paid sessions with metadata.order_id and numeric amount_total, await config.onPaid({sessionId: session.id, orderId: session.metadata.order_id, amount: session.amount_total}). Ignore unpaid sessions and other events with a 2xx response and no side effects. Return 2xx only after the callback succeeds; callback failure returns 5xx.`
const github = `POST /webhooks/github accepts JSON GitHub webhooks. Verify X-Hub-Signature-256 against the original body and config.githubSecret. Reject invalid, missing or tampered signatures with a 4xx response and no side effects. Only X-GitHub-Event: issues with action: opened calls and awaits config.onIssue({repository: payload.repository.full_name, number: payload.issue.number, title: payload.issue.title}). Other events/actions return 2xx with no side effects. Callback failure returns 5xx.`

export const tasks = {
  "stripe-billing": [base + "\n\n" + stripe],
  "github-existing": [base + "\n\n" + github + "\nPreserve the existing /health endpoint."],
  "multi-provider-change": [
    base + "\n\n" + stripe,
    "Extend the existing app without regressing any prior requirements:\n" + github + "\nStripe must continue to work. Verify both providers and existing routes.",
  ],
}

export const starter = `import type { Config, App } from './contract.js'
export function createApp(_config: Config): App {
  return { fetch(request) {
    if (new URL(request.url).pathname === '/health') return Response.json({ ok: true })
    return new Response(null, { status: 404 })
  } }
}
`

export const honoStarter = `import { Hono } from 'hono'
import type { Config, App } from './contract.js'
export function createApp(_config: Config): App {
  return new Hono().get('/health', c => c.json({ ok: true }))
}
`
