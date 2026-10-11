# Secure webhook handling

Hibiki verifies raw request bytes before parsing. Production endpoints also need body limits, persistent deduplication, and authorization checks for the actions their handlers perform.

## Limit incoming requests

`new Hibiki({ maxBodyBytes: 1_048_576 })` limits the raw body to 1 MiB by default. Hibiki counts actual stream bytes, including requests without `Content-Length` or with a falsely small value, and returns `413 / HIBIKI_PAYLOAD_TOO_LARGE` before signature verification. The original request remains readable by handlers. Increase the limit explicitly if your provider sends larger payloads.

Configure rate limits and request timeouts at your reverse proxy or platform. Handler middleware runs after verification and cannot protect the body-reading stage from unauthenticated traffic.

## Prevent duplicate side effects

Built-in providers supply authenticated deduplication IDs: Stripe event IDs, Discord interaction IDs, and SHA-256 hashes of GitHub's raw body. GitHub's `X-GitHub-Delivery` header is not signed and is never used as an authenticated ID. Identical GitHub bodies share an ID, even if the delivery or event header changes. This also means legitimate deliveries with byte-identical bodies are treated as duplicates.

For registered handlers, Hibiki claims the ID before execution. A successfully completed duplicate returns `204`; a concurrent duplicate returns `503 / HIBIKI_EVENT_IN_PROGRESS` so the sender can retry. A thrown handler error or a non-2xx response releases the claim for another attempt. Unsupported events and events without handlers do not consume claims. Custom providers must supply IDs derived from authenticated data to use this protection.

The default store retains completed IDs for 24 hours and holds at most 10,000 entries per application. It returns `503 / HIBIKI_IDEMPOTENCY_UNAVAILABLE` at capacity rather than evicting protected IDs. Running claims do not expire. Builder instances created with `use()` share the store. You can tune a process-local store:

```ts
import { Hibiki, createMemoryIdempotencyStore } from "@hibiki-js/core"

const app = new Hibiki({
  maxBodyBytes: 1_048_576,
  idempotencyStore: createMemoryIdempotencyStore({
    retentionMs: 86_400_000,
    maxEntries: 10_000,
  }),
})
```

Memory protection ends at expiry or process restart and does not span independent instances. For production, provide a shared durable `IdempotencyStore` through `idempotencyStore`. Its contract is:

- `claim(key)` atomically returns `{ status: "acquired", token }`, `{ status: "pending" }`, or `{ status: "completed" }`. Tokens uniquely identify claim ownership.
- `complete(key, token)` marks only the matching running claim completed.
- `release(key, token)` removes only the matching running claim. It must never remove a completed claim or a newer owner's claim.

Store failures return `503`. If completion fails after a successful handler, Hibiki keeps the claim pending rather than releasing it and repeating side effects. Shared stores must preserve running claims while handlers execute; expiring a lease without renewal can permit concurrent execution. Recover abandoned claims only after confirming the original handler cannot still run. Set completed retention to cover your retry/replay policy. GitHub signatures have no signed timestamp, so old signed bodies can be replayed after their IDs are forgotten.

This is not an exactly-once transaction between your store and business database. Use a database transaction with a unique event key or the downstream API's idempotency key for payments, provisioning, and other irreversible effects. `waitUntil` work is outside the awaited handler: persist/enqueue it durably before acknowledging success.

## Restrict GitHub actions

GitHub signs the body, not `X-GitHub-Event`. Hibiki validates required payload fields before passing typed events to handlers. For example, a `push` body cannot be routed to `delete` without a valid `ref_type`. Configure the endpoint's expected events and repositories:

```ts
import { github } from "@hibiki-js/github"

const provider = github({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
  allowedEvents: ["pull_request.opened", "pull_request.closed"],
  allowedRepositories: ["your-org/your-repo"],
})
```

These lists default to unrestricted and are checked for supported events before handler execution. A repository restriction also rejects a ping without a matching repository. Give each endpoint a dedicated secret and allow only the events it needs.

Schema checks cannot authenticate an unsigned header. GitHub `create` and `delete` payloads can have the same shape, so changing the header before the first accepted delivery can still select a different allowed route. Separate sensitive routes with dedicated secrets and a single expected event, and verify the current resource state through GitHub's API before destructive actions. Replay deduplication helps only after the signed body has been claimed.

## Validate signing configuration

Stripe and GitHub require non-empty secrets. Stripe and Discord reject non-finite or negative timestamp tolerance. Stripe and GitHub accept only 64 hexadecimal characters for SHA-256 signatures. Stripe supported events and Discord supported interactions require non-empty IDs. Webhook senders reject redirects so signed payloads are not silently forwarded to another endpoint.

Never put secrets or Discord webhook URLs in client-side code or logs. Treat payload strings as untrusted input when constructing SQL, shell commands, HTML, or external requests.
