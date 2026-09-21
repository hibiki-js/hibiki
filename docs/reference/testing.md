# `@hibiki-js/testing`

Helpers for signed webhook requests in tests.

## Install

```bash
pnpm add -D @hibiki-js/testing
```

## `createWebhookTest(app, options)`

```ts
import { createWebhookTest } from "@hibiki-js/testing"

const webhook = createWebhookTest(app, {
  secrets: { stripe: "whsec_test", github: "gh_secret" },
})
```

### `emit(request, provider)`

Forwards a raw `Request` to `app.handle`.

### `emitEvent(eventName, payload?)`

Builds a signed request for a Hibiki event name such as `stripe.checkout.session.completed` or `github.push`, then calls `handle`.

For Stripe, if `payload` is not already a full event envelope, it is wrapped as:

```ts
{ id: "evt_test", type: nativeEventName, data: { object: payload } }
```

For GitHub action events, `action` is injected when missing.

## Low-level helpers

### `stripeRequest(payload, secret, timestamp?)`

Returns a `Request` with a valid `Stripe-Signature` header.

### `githubRequest(payload, event, secret, contentType?)`

Returns a `Request` with `X-GitHub-Event` and `X-Hub-Signature-256`.
