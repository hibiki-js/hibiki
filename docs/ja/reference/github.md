# `@hibiki-js/github`

Hibiki 向けの公式 GitHub Webhook プロバイダーです。`X-Hub-Signature-256` を Web Crypto で検証し、よく使う JSON イベントを型付きで公開します。Octokit には**依存しません**。

## インストール

```bash
pnpm add @hibiki-js/core @hibiki-js/github
```

## 短い例

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

ハンドラは `github.` プレフィックスを使います。action 付きの配信は、`github.pull_request.opened` のようにドット区切りになります（ヘッダー `X-GitHub-Event: pull_request` + ペイロード `action: "opened"`）。

## `github(options)`

```ts
import { github } from "@hibiki-js/github"

const provider = github({
  secret: string,
})
```

戻り値は `HibikiProvider<"github", GitHubEvents>` です。

| オプション | 型 | 説明 |
| --- | --- | --- |
| `secret` | `string` | GitHub App またはリポジトリ Webhook に設定したシークレット |

### 検証

1. `sha256=` で始まる `X-Hub-Signature-256` を必須にする
2. 接頭辞以降の hex をデコードする
3. 共有シークレットで生 body の HMAC-SHA256 を検証する

失敗時は `HIBIKI_VERIFICATION_FAILED`（`400`）の `HibikiError` です。

### Content-Type

このプロバイダーは `contentTypes: ["application/json"]` を設定します。署名が通ったあと、それ以外のメディアタイプは `415` / `HIBIKI_UNSUPPORTED_CONTENT_TYPE` で拒否します。form-urlencoded の GitHub ペイロードには対応していません。

### パース

1. body を `JSON.parse`（オブジェクト以外は `HIBIKI_PARSE_FAILED`）
2. `X-GitHub-Event` を読む
3. 単純イベント（`push`、`ping`、`create`、`delete`）はそのまま対応付ける
4. action イベントは `(event, action)` の組（例: `pull_request` + `opened`）で照合する
5. それ以外は `{ kind: "unsupported" }` → 既定で HTTP `200`

## イベント名の対応

| GitHub の配信 | Hibiki のイベント名 |
| --- | --- |
| `X-GitHub-Event: push` | `github.push` |
| `X-GitHub-Event: ping` | `github.ping` |
| `pull_request` + `action: "opened"` | `github.pull_request.opened` |
| `pull_request_review` + `action: "submitted"` | `github.pull_request_review.submitted` |
| `workflow_job` + `action: "completed"` | `github.workflow_job.completed` |

ペイロード型は必須フィールド（`repository.full_name`、`pull_request.number` など）と、残りの index signature だけの薄い型です。

## 署名付き配信の送信

`createGitHubWebhook(url, { secret })` は、GitHub互換の署名付きJSONを任意のWebhook URLへ送信します。action イベントにはドット区切りの Hibiki イベント名を渡します。送信時に `X-GitHub-Event` の値を自動で求めます。

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

`send` はJSON本文のHMAC-SHA256署名を作成し、`X-GitHub-Event` と `X-Hub-Signature-256` を設定して、成功時に受信側の `Response` を返します。HTTPエラーとネットワークエラーは例外になります。この機能は任意URLへGitHub互換リクエストを送るもので、GitHub上のイベント作成・配信は行いません。

## export する型

| Export | 説明 |
| --- | --- |
| `github` | プロバイダー工場関数 |
| `createGitHubWebhook` | 署名付きWebhook送信クライアントを作成 |
| `GitHubEvents` | 対応イベント名 → ペイロード型 |
| `GitHubOptions` | `{ secret: string }` |
| `GitHubWebhookSender` | 対応Webhookイベント用の型付き送信クライアント |
| `GitHubWebhookSenderOptions` | 送信シークレットと任意の `fetch` |

## 補足

- Octokit 非依存
- JSON Webhook のみ
- 未対応の GitHub イベント（未収録の action 含む）は、Core の `strictEvents` が無い限り `200`
- 署名付きフィクスチャには `@hibiki-js/testing`（`githubRequest` / `createWebhookTest`）を使う

## 関連

- [GitHub プロバイダーガイド](/ja/providers/github) — 対応イベント一覧
- [Hono + GitHub の例](https://github.com/hibiki-js/hibiki/tree/main/examples/hono-github)
- [Core リファレンス](/ja/reference/core) — `handle`・応答・エラー
