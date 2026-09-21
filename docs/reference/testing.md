# `@hibiki-js/testing`

Test helpers that build correctly signed webhook `Request`s and drive them through a Hibiki app. Use this package in unit / integration tests so you do not reimplement Stripe or GitHub signature schemes.

## Install

```bash
pnpm add -D @hibiki-js/testing
```

Peer: `@hibiki-js/core` (workspace / published version matching your app).

## Quick example

```ts
import { describe, expect, it } from "vitest"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { createWebhookTest } from "@hibiki-js/testing"

describe("billing webhook", () => {
  it("handles invoice.paid", async () => {
    const app = new Hibiki().use(stripe({ secret: "whsec_test" }))
    let invoiceId = ""
    app.on("stripe.invoice.paid", ({ event }) => {
      invoiceId = event.data.object.id
    })

    const webhook = createWebhookTest(app, {
      secrets: { stripe: "whsec_test" },
    })

    const response = await webhook.emitEvent("stripe.invoice.paid", {
      id: "in_123",
      object: "invoice",
    })

    expect(response.status).toBe(204)
    expect(invoiceId).toBe("in_123")
  })
})
```

## `createWebhookTest(app, options)`

```ts
import { createWebhookTest } from "@hibiki-js/testing"

const webhook = createWebhookTest(app, {
  secrets: {
    stripe: "whsec_test",
    github: "gh_secret",
  },
})
```

| Option | Description |
| --- | --- |
| `secrets` | Map of provider name → signing secret. Required for `emitEvent` per provider you call |

Returns an object with `emit` and `emitEvent`.

### `emit(request, provider)`

Forwards a raw `Request` to `app.handle(request, { provider })`. Useful when you already built a request with `stripeRequest` / `githubRequest`, or when testing negative cases (wrong secret, bad content type).

```ts
const request = await stripeRequest(payload, "wrong-secret")
const response = await webhook.emit(request, "stripe")
expect(response.status).toBe(400)
```

### `emitEvent(eventName, payload?)`

Builds a **signed** request for a Hibiki event name such as `stripe.checkout.session.completed` or `github.pull_request.opened`, then calls `handle`.

```ts
await webhook.emitEvent("github.push", {
  ref: "refs/heads/main",
  repository: { full_name: "acme/app" },
})
```

Rules:

| Provider | Behavior |
| --- | --- |
| Stripe | If `payload` is not already a full event envelope (`type` present), wrap as `{ id: "evt_test", type: <native>, data: { object: payload } }` |
| GitHub | Split `provider.event` / `provider.event.action`. For action events, inject `action` when the payload omits it. Set `X-GitHub-Event` to the GitHub event name |
| Other | Throws — only Stripe and GitHub helpers are built in |

Missing `secrets[provider]` throws with a clear error before any request is sent.

## Low-level helpers

### `stripeRequest(payload, secret, timestamp?)`

```ts
await stripeRequest(
  { id: "evt_1", type: "invoice.paid", data: { object: { id: "in_1", object: "invoice" } } },
  "whsec_test",
  Math.floor(Date.now() / 1000), // optional; defaults to now
)
```

Returns a `POST` `Request` to `https://hibiki.test/webhook` with:

- `Content-Type: application/json`
- Valid `Stripe-Signature` (`t=…,v1=…`) for the given secret and timestamp

Pass a stale `timestamp` to assert tolerance / expiry behavior.

### `githubRequest(payload, event, secret, contentType?)`

```ts
await githubRequest(
  { action: "opened", pull_request: { number: 1 }, repository: { full_name: "acme/app" } },
  "pull_request",
  "gh_secret",
)
```

Returns a `POST` `Request` with:

- `Content-Type` (default `application/json`)
- `X-GitHub-Event`
- Valid `X-Hub-Signature-256`

Use a non-JSON `contentType` to assert `415` handling.

## Tips

- Keep test secrets short and constant; they never leave the test process
- Prefer `emitEvent` for happy-path routing tests; use low-level helpers for crypto / header edge cases
- Assert on `response.status` and `await response.text()` for `HibikiError` codes such as `HIBIKI_VERIFICATION_FAILED`

## Related

- [Testing guide](/guides/testing)
- [Core reference](/reference/core)
- [Stripe](/reference/stripe) / [GitHub](/reference/github)
