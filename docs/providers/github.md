# GitHub

`githubEvents` exports the readonly native event/action list for the installed package. GitHub deliveries must be JSON. Common issue/pull-request fields (title, body, state, author and refs) have curated optional types; other fields remain `unknown`. These types do not perform runtime business validation. [Provider coverage](/providers.json) lists the corresponding package version and format.

```ts
import { Hibiki } from "@hibiki-js/core"
import { github } from "@hibiki-js/github"

const app = new Hibiki().use(github({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
}))
```

Only `application/json` payloads are accepted. Other GitHub events return 200 by default (or 400 with `strictEvents: true`).

## Supported events

- `push`
- `ping`
- `create`
- `delete`
- `pull_request.opened`
- `pull_request.closed`
- `pull_request.reopened`
- `pull_request.synchronize`
- `pull_request.ready_for_review`
- `pull_request.labeled`
- `pull_request_review.submitted`
- `issues.opened`
- `issues.closed`
- `issues.reopened`
- `issue_comment.created`
- `release.published`
- `workflow_run.completed`
- `workflow_job.completed`
- `check_suite.completed`
- `check_run.completed`
- `deployment.created`
- `deployment_status.created`

Handlers use the `github.` prefix:

```ts
app.on("github.pull_request.opened", async ({ event }) => {
  console.log(event.pull_request.number, event.repository.full_name)
})
```

See the [API reference](/reference/github) for options and exported types.
