# `@hibiki-js/github`

GitHub webhook provider with curated event types and Web Crypto signature verification.

## Install

```bash
pnpm add @hibiki-js/core @hibiki-js/github
```

## `github(options)`

```ts
import { github } from "@hibiki-js/github"

github({
  secret: string,
})
```

Returns `HibikiProvider<"github", GitHubEvents>`.

## Exported types

- `GitHubEvents`
- `GitHubOptions`

## Notes

- No Octokit dependency
- Verifies `X-Hub-Signature-256`
- Accepts only `application/json`
- Action events are keyed as `pull_request.opened`, `issues.closed`, and so on

See [GitHub provider guide](/providers/github) for the full supported event list.
