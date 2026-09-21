# `@hibiki-js/github`

厳選したイベント型と Web Crypto 署名検証を持つ GitHub Webhook プロバイダーです。

## インストール

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

戻り値は `HibikiProvider<"github", GitHubEvents>` です。

## エクスポートされる型

- `GitHubEvents`
- `GitHubOptions`

## 補足

- Octokit 依存なし
- `X-Hub-Signature-256` を検証
- `application/json` のみ受付
- アクション付きイベントは `pull_request.opened` や `issues.closed` のようにキー付け

対応イベント一覧は [GitHub プロバイダーガイド](/ja/providers/github) を参照してください。
