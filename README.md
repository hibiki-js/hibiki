# Hibiki

Type-safe webhooks for TypeScript.

Zero runtime dependencies. Built on Web Standards.

## Install

```bash
npm install @hibiki-js/core @hibiki-js/stripe
```

## Quick Start

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki().use(
  stripe({
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  }),
)

app.on("stripe.checkout.session.completed", async ({ event }) => {
  console.log(event.data.object.id)
})

export const POST = (request: Request) =>
  app.handle(request, { provider: "stripe" })
```

## Why Hibiki?

Stripe and GitHub have different webhook formats, signature schemes, and event types.

Hibiki gives them a common, type-safe programming model:

```ts
app.on("stripe.checkout.session.completed", async ({ event }) => {
  console.log(event.data.object.id)
})

app.on("github.issues.opened", async ({ event }) => {
  console.log(event.issue.title)
})
```

Provider-specific verification and parsing stay inside the provider package.

Use Hibiki when a common webhook model across providers or zero provider runtime dependencies matters. An existing SDK can be enough for a single-provider app. Hibiki leaves durable storage, queues, retries and idempotency to your application. See [Choosing Hibiki](./docs/guide/choosing-hibiki.md) for coverage and tradeoffs.

## Features

- Type-safe event handlers
- Zero runtime dependencies
- Web Standards `Request` / `Response`
- Signature verification before parsing
- Edge-ready
- Multi-provider
- Test utilities for webhook handlers

## Providers

| Provider | Package |
| --- | --- |
| Stripe | `@hibiki-js/stripe` |
| GitHub | `@hibiki-js/github` |
| Discord Interactions | `@hibiki-js/discord` |

## Integrations

| Framework / Runtime | Integration |
| --- | --- |
| Hono | `@hibiki-js/hono` |
| Next.js Route Handlers | Core directly |
| Cloudflare Workers | Core directly |

Hibiki Core works with Web Standards `Request` and `Response`, so framework-specific adapters are only added where they provide additional value.

## Webhook behavior

Hibiki verifies signatures before parsing and preserves the original request body for handlers.

- Unsupported provider events return `200` by default
- Unsupported provider events return `400` with `strictEvents: true`
- Supported events without a registered handler return `204`

## Testing

Webhook handlers can be tested with `@hibiki-js/testing`.

```ts
import { createWebhookTest } from "@hibiki-js/testing"

const webhook = createWebhookTest(app, {
  secrets: {
    stripe: "whsec_test",
  },
})

await webhook.emitEvent("stripe.checkout.session.completed", {
  id: "cs_test",
  object: "checkout.session",
})
```

CI keeps the detailed unit tests on Node.js 22 and runs a shared compatibility
suite against built packages on Bun 1.4.3, Deno 2.9.6, and workerd
1.20260730.1 (Miniflare 4.20260730.0, compatibility date `2026-07-30`, without
`nodejs_compat`). The suite checks Core dispatch and Stripe, GitHub, and Discord
signature verification, including rejected requests. Other runtime versions are
not covered by these CI checks.

To run the compatibility checks locally, install the pinned Bun and Deno versions,
then use Node.js 22 and pnpm 10.4.1:

```bash
pnpm install --frozen-lockfile
pnpm build:runtime
pnpm typecheck:runtime
pnpm test:bun
pnpm test:deno
pnpm test:workerd
```

## Examples

Examples are available for:

- Next.js + Stripe
- Cloudflare Workers + Stripe
- Hono + Stripe
- Hono + GitHub

See [`examples/`](./examples).

[`examples/hono-webhooks`](./examples/hono-webhooks) injects business services and tests Stripe/GitHub through actual Hono routes, including side effects and invalid signatures. Run `pnpm check:examples` in this repository.

Performance and consumer bundle-size measurements are available in [`benchmarks/`](./benchmarks).

## Coding agents

Use the [reference index](https://hibiki-js.github.io/llms.txt) and [versioned provider coverage](https://hibiki-js.github.io/providers.json). The optional [Hibiki skill](./skills/hibiki/SKILL.md) covers implementation and local verification. [Agent evaluations](./evals/README.md) measure neutral selection, provider SDK/direct implementation comparisons, and changes to existing Hibiki applications. Model runs are opt-in.

## Documentation

Site: https://hibiki-js.github.io (`pnpm docs:dev`)

- [Getting Started](./docs/guide/getting-started.md)
- [Stripe](./docs/providers/stripe.md)
- [GitHub](./docs/providers/github.md)
- [Discord](./docs/providers/discord.md)
- [Hono](./docs/integrations/hono.md)
- [Testing](./docs/guides/testing.md)
- [Security](./docs/guides/security.md)
