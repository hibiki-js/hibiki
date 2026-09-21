# GitHub

```ts
import { Hibiki } from "@hibiki-js/core"
import { github } from "@hibiki-js/github"

const app = new Hibiki().use(github({
  secret: process.env.GITHUB_WEBHOOK_SECRET!,
}))
```

受け付けるのは `application/json` のみです。その他の GitHub イベントはデフォルトで 200（`strictEvents: true` なら 400）です。

## 対応イベント

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

ハンドラは `github.` プレフィックスを使います。

```ts
app.on("github.pull_request.opened", async ({ event }) => {
  console.log(event.pull_request.number, event.repository.full_name)
})
```

オプションと型の詳細は [API リファレンス](/ja/reference/github) を参照してください。
