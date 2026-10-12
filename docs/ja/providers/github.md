# GitHub

`githubEvents`から、導入したパッケージの対応イベントとactionの一覧を取得できます。JSON形式の配信に対応しています。Issue・Pull Requestのタイトル、本文、状態、作成者、ブランチ情報などに省略可能な型があり、その他は`unknown`です。型による業務データの実行時検証は行いません。[対応範囲のJSON](/providers.json)にパッケージバージョンと形式を載せています。

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
