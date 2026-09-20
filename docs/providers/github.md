# GitHub

```ts
import { Hibiki } from "@hibiki-js/core"
import { github } from "@hibiki-js/github"

const app = new Hibiki().use(github({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
}))
```

Supported events in v0.1:

- `push`
- `pull_request.opened`
- `pull_request.closed`
- `issues.opened`

Only `application/json` payloads are accepted.
