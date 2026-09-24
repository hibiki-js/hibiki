# `@hibiki-js/github`

Official GitHub webhook provider for Hibiki. It verifies `X-Hub-Signature-256` with Web Crypto and exposes a curated set of typed JSON events. Octokit is **not** a dependency.

## Install

```bash
pnpm add @hibiki-js/core @hibiki-js/github
```

## Quick example

```ts
import { Hibiki } from "@hibiki-js/core"
import { github } from "@hibiki-js/github"

const app = new Hibiki().use(github({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
}))

app.on("github.pull_request.opened", async ({ event }) => {
  console.log(event.pull_request.number, event.repository.full_name)
})

export async function POST(request: Request) {
  return app.handle(request, { provider: "github" })
}
```

Handlers use the `github.` prefix. Action-bearing GitHub deliveries become dotted names such as `github.pull_request.opened` (header `X-GitHub-Event: pull_request` + payload `action: "opened"`).

## `github(options)`

```ts
import { github } from "@hibiki-js/github"

const provider = github({
  secret: string,
})
```

Returns `HibikiProvider<"github", GitHubEvents>`.

| Option | Type | Description |
| --- | --- | --- |
| `secret` | `string` | Webhook secret configured in the GitHub App or repository webhook settings |

### Verification

1. Require `X-Hub-Signature-256` starting with `sha256=`
2. Decode the hex digest after the prefix
3. Verify HMAC-SHA256 over the raw body bytes with the shared secret

Failures throw `HibikiError` with `HIBIKI_VERIFICATION_FAILED` (`400`).

### Content type

This provider sets `contentTypes: ["application/json"]`. After a valid signature, Hibiki rejects other media types with `415` / `HIBIKI_UNSUPPORTED_CONTENT_TYPE`. Form-urlencoded GitHub payloads are not supported.

### Parsing

1. `JSON.parse` the body text (non-objects → `HIBIKI_PARSE_FAILED`)
2. Read `X-GitHub-Event`
3. For simple events (`push`, `ping`, `create`, `delete`), map directly
4. For action events, match `(event, action)` pairs such as `pull_request` + `opened`
5. Anything else → `{ kind: "unsupported" }` → HTTP `200` by default

## Event naming

| GitHub delivery | Hibiki event name |
| --- | --- |
| `X-GitHub-Event: push` | `github.push` |
| `X-GitHub-Event: ping` | `github.ping` |
| `pull_request` + `action: "opened"` | `github.pull_request.opened` |
| `pull_request_review` + `action: "submitted"` | `github.pull_request_review.submitted` |
| `workflow_job` + `action: "completed"` | `github.workflow_job.completed` |

Payload types keep a few required fields (`repository.full_name`, `pull_request.number`, …) plus an index signature for the rest of GitHub's JSON. They are intentionally thin.

## Sending signed deliveries

`createGitHubWebhook(url, { secret })` sends GitHub-compatible signed JSON to any webhook URL. For action events, use the dotted Hibiki event name; the sender derives the native `X-GitHub-Event` header from it.

```ts
import { createGitHubWebhook } from "@hibiki-js/github"

const sender = createGitHubWebhook(process.env.WEBHOOK_URL!, {
  secret: process.env.WEBHOOK_SECRET!,
})
const response = await sender.send("pull_request.opened", {
  action: "opened",
  pull_request: { number: 42 },
  repository: { full_name: "acme/app" },
})
if (!response.ok) throw new Error(`Webhook receiver returned ${response.status}`)
```

`send` signs the exact JSON body with HMAC-SHA256, sets `X-GitHub-Event` and `X-Hub-Signature-256`, and returns the receiver's `Response`. This sends GitHub-compatible requests to your URL; it does not create or deliver events through GitHub itself.

## Exported types

| Export | Description |
| --- | --- |
| `github` | Provider factory |
| `createGitHubWebhook` | Create a signed webhook sender |
| `GitHubEvents` | Map of supported event name → payload type |
| `GitHubOptions` | `{ secret: string }` |
| `GitHubWebhookSender` | Typed sender for supported webhook events |
| `GitHubWebhookSenderOptions` | Sender secret and optional custom `fetch` |

## Notes

- No Octokit dependency
- JSON webhooks only
- Unsupported GitHub events (including actions you have not curated) return `200` unless Core `strictEvents` is enabled
- Use `@hibiki-js/testing` (`githubRequest` / `createWebhookTest`) for signed fixtures

## Related

- [GitHub provider guide](/providers/github) — full supported event list
- [Hono + GitHub example](https://github.com/hibiki-js/hibiki/tree/main/examples/hono-github)
- [Core reference](/reference/core) — `handle`, responses, errors
