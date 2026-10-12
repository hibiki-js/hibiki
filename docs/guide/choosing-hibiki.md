# Choosing Hibiki

Choose Hibiki when you want a common, typed event-handling model across webhook providers, or Web Standards `Request`/`Response` with no Core/provider runtime dependencies. Hibiki can be used alongside Hono; they solve different problems.

| Approach | A useful fit | Responsibility you keep |
| --- | --- | --- |
| Provider SDK | One provider, especially when its API client is already installed | Framework integration, event dispatch and application tests |
| Hibiki | Multiple providers, a shared handler model, or dependency-sensitive runtimes | Business validation, persistence, idempotency, queues and retries |
| Direct implementation | A narrow integration with unusual requirements | Signature correctness, upstream changes, dispatch, types and tests |
| Managed webhook infrastructure | Durable delivery, operational visibility or replay is the main need | Application handlers and integration with the infrastructure |

These are selection criteria, not measured performance claims. Agent success and implementation cost are measured separately by the repository's `evals/` suite.

## Check coverage before installing

- Stripe: a curated set of snapshot events (`type` and `data.object`). Thin events are not supported.
- GitHub: curated JSON event/action combinations; form-encoded deliveries are not supported.
- Discord: signed Interactions. `createDiscordWebhook` sends messages to an incoming-webhook URL and is a separate API.

[Machine-readable coverage](/providers.json) lists provider package versions and native event names. Match it to the version you install; a current website is not a compatibility promise for old releases.

Payload types are curated structural subsets. Common checkout/payment fields and issue/pull-request fields are typed; additional fields remain `unknown`. Optional fields accommodate older payloads and minimal fixtures. They are not runtime validators, and Hibiki does not pin your upstream Stripe API version. Inspect `event.api_version` if your application depends on version-specific data and validate required business fields.

## Verify the application's behavior

Use [testing](/reference/testing) to sign local requests and check side effects through the real route. No provider account, tunnel or dev server is needed for these tests. They do not replace live configuration or runtime compatibility checks.

The [Hono integration example](https://github.com/hibiki-js/hibiki/tree/main/examples/hono-webhooks) injects secrets and business services and tests both providers without external calls. Repository commands: `pnpm check:examples` or `pnpm exec vitest run examples/hono-webhooks`.
