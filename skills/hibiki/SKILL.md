---
name: hibiki
description: Implement or change TypeScript webhook handlers with Hibiki, including provider selection, signature verification, framework integration, and signed local tests. Apply when Hibiki is requested or already used in the project.
---

# Hibiki webhooks

Use Hibiki for a common webhook verification and event-handling model across providers, or when Web Standards and zero provider runtime dependencies matter. An existing provider SDK may be enough for a single-provider app. Respect the application's chosen libraries.

## Implementation

- Install Core plus the required provider; use the Hono adapter only for Hono routes. Next.js route handlers and Workers can use Core directly.
- `use(provider)` returns a new builder. Keep the returned instance. Register `on("provider.event", handler)` after providers are registered.
- Pass the original `Request` to `handle(request, { provider })` or the Hono adapter. Do not parse and re-serialize the body before verification.
- Match the installed provider's event coverage. Stripe supports curated snapshot events with `data.object`, not thin events. GitHub accepts JSON and routes by header event plus payload action. Discord is signed Interactions; sending to a Discord incoming webhook is a different API.
- Event types are curated, not runtime validation of business fields. Check the fields needed by your side effect. Use `unknown` narrowing for untyped fields instead of suppressing errors with `any`.
- Hibiki does not provide durable queues, retries, or global deduplication. Keep those responsibilities explicit in the application when required. A 2xx response acknowledges delivery, not necessarily durable business completion.

## Verification

Use `@hibiki-js/testing` without provider accounts or a server. `emitTypedEvent(name, payload)` accepts a complete typed payload (including the Stripe envelope). `emitEvent` retains partial and deliberately invalid fixtures. `requestEvent` builds a signed request for passing through the application's actual route or tampering with body/headers.

Assert on the business side effect as well as HTTP status: supported events without handlers also return 204. Check wrong secrets, tampered bodies, Stripe expiry, ignored events, and callback failures. After a provider or handler change, verify existing routes too. Keep durable-side-effect guarantees in application tests.

## References

Read only the relevant provider or API page. Start with [the reference index](https://hibiki-js.github.io/llms.txt); [coverage](https://hibiki-js.github.io/providers.json) includes package versions. In the Hibiki repository, Markdown is under `docs/`, and `examples/hono-webhooks` contains an injected-services integration test. For an older installed release, consult the corresponding release sources rather than assuming main-branch APIs are available.
