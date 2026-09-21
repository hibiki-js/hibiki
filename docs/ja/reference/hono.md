# `@hibiki-js/hono`

Hibiki アプリを、登録済みプロバイダー 1 つ分の Hono ルートハンドラに変換する薄いアダプターです。Core 自体が `Request` / `Response` を話すので、このパッケージがやるのは Hono の context を `Hibiki#handle` へ橋渡しすることだけです。

## インストール

```bash
pnpm add @hibiki-js/core @hibiki-js/hono hono
```

`hono` と `@hibiki-js/core` は peer dependency です。Hibiki は Hono をバンドルしません。

Hono `^4.0.0` が必要です。

## 短い例

```ts
import { Hono } from "hono"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { hibiki } from "@hibiki-js/hono"

const webhooks = new Hibiki()
  .use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))

webhooks.on("stripe.invoice.paid", async ({ event }) => {
  console.log(event.data.object.id)
})

export const app = new Hono()
  .post("/webhooks/stripe", hibiki(webhooks, "stripe"))
```

## `hibiki(app, provider)`

```ts
import { hibiki } from "@hibiki-js/hono"
import type { MiddlewareHandler } from "hono"

function hibiki(
  app: Hibiki<R>,
  provider: /* 登録済みプロバイダー名 */,
): MiddlewareHandler
```

| 引数 | 説明 |
| --- | --- |
| `app` | プロバイダーとハンドラを設定済みの Hibiki インスタンス |
| `provider` | `app.handle` に渡すプロバイダー名（例: `"stripe"`、`"github"`） |

動き:

1. `context.req.raw` から Web Standards の生リクエストを取る
2. `app.handle(rawRequest, { provider })` を呼ぶ
3. その `Response` を Hono に返す

追加の body バッファリング、ヘッダー書き換え、ステータス変換はありません。署名検証・パース・ステータスコードはすべて Core / プロバイダー側のものです。

### 複数プロバイダー

プロバイダーごとにルートを 1 本マウントします。`hibiki(...)` の呼び出しは、それぞれ 1 つのプロバイダー名に固定されます。

```ts
const webhooks = new Hibiki()
  .use(stripe({ secret: stripeSecret }))
  .use(github({ secret: githubSecret }))

const app = new Hono()
  .post("/webhooks/stripe", hibiki(webhooks, "stripe"))
  .post("/webhooks/github", hibiki(webhooks, "github"))
```

### `waitUntil`

このアダプターはプラットフォームの `waitUntil` を転送しません。Cloudflare Workers 上の Hono などで必要な場合は、Core の `handle` を直接呼び、options に `waitUntil` を渡してください。[Cloudflare + Stripe ガイド](/ja/guides/cloudflare-stripe) を参照してください。

## 型

便宜上、`@hibiki-js/core` から `RegisteredEventName` を再エクスポートします。アダプターと並べてイベント名を型付けするときに使えます。

## 関連

- [Hono 連携](/ja/integrations/hono)
- [Hono + Stripe の手順](/ja/guides/hono-stripe)
- [Core リファレンス](/ja/reference/core)
