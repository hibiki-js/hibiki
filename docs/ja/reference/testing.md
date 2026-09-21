# `@hibiki-js/testing`

正しく署名された Webhook の `Request` を組み立て、Hibiki アプリへ流すためのテストヘルパーです。Stripe / GitHub の署名方式をテスト側で再実装しなくてよくなります。

## インストール

```bash
pnpm add -D @hibiki-js/testing
```

peer は `@hibiki-js/core`（アプリと同じバージョン）です。

## 短い例

```ts
import { describe, expect, it } from "vitest"
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { createWebhookTest } from "@hibiki-js/testing"

describe("billing webhook", () => {
  it("handles invoice.paid", async () => {
    const app = new Hibiki().use(stripe({ secret: "whsec_test" }))
    let invoiceId = ""
    app.on("stripe.invoice.paid", ({ event }) => {
      invoiceId = event.data.object.id
    })

    const webhook = createWebhookTest(app, {
      secrets: { stripe: "whsec_test" },
    })

    const response = await webhook.emitEvent("stripe.invoice.paid", {
      id: "in_123",
      object: "invoice",
    })

    expect(response.status).toBe(204)
    expect(invoiceId).toBe("in_123")
  })
})
```

## `createWebhookTest(app, options)`

```ts
import { createWebhookTest } from "@hibiki-js/testing"

const webhook = createWebhookTest(app, {
  secrets: {
    stripe: "whsec_test",
    github: "gh_secret",
  },
})
```

| オプション | 説明 |
| --- | --- |
| `secrets` | プロバイダー名 → 署名シークレット。`emitEvent` で使うプロバイダーごとに必須 |

戻り値は `emit` と `emitEvent` を持つオブジェクトです。

### `emit(request, provider)`

生の `Request` を `app.handle(request, { provider })` に渡します。すでに `stripeRequest` / `githubRequest` で組み立てたリクエストや、シークレット誤り・不正な Content-Type などのネガティブケース向きです。

```ts
const request = await stripeRequest(payload, "wrong-secret")
const response = await webhook.emit(request, "stripe")
expect(response.status).toBe(400)
```

### `emitEvent(eventName, payload?)`

`stripe.checkout.session.completed` や `github.pull_request.opened` のような Hibiki イベント名向けに**署名付き**リクエストを組み立て、`handle` を呼びます。

```ts
await webhook.emitEvent("github.push", {
  ref: "refs/heads/main",
  repository: { full_name: "acme/app" },
})
```

ルール:

| プロバイダー | 挙動 |
| --- | --- |
| Stripe | `payload` がイベント封筒（`type` あり）でなければ `{ id: "evt_test", type: <native>, data: { object: payload } }` で包む |
| GitHub | `provider.event` / `provider.event.action` に分割。action イベントで `action` が無ければ注入する。`X-GitHub-Event` に GitHub のイベント名を載せる |
| その他 | throw（組み込みヘルパーは Stripe と GitHub のみ） |

`secrets[provider]` が無い場合は、リクエスト送信前に分かりやすいエラーを投げます。

## 低レベルのヘルパー

### `stripeRequest(payload, secret, timestamp?)`

```ts
await stripeRequest(
  { id: "evt_1", type: "invoice.paid", data: { object: { id: "in_1", object: "invoice" } } },
  "whsec_test",
  Math.floor(Date.now() / 1000), // 省略可。既定は現在時刻
)
```

次のヘッダー付き `POST` `Request`（URL は `https://hibiki.test/webhook`）を返します。

- `Content-Type: application/json`
- 指定シークレットと timestamp で正当な `Stripe-Signature`（`t=…,v1=…`）

古い `timestamp` を渡すと、tolerance / 期限切れの検証に使えます。

### `githubRequest(payload, event, secret, contentType?)`

```ts
await githubRequest(
  { action: "opened", pull_request: { number: 1 }, repository: { full_name: "acme/app" } },
  "pull_request",
  "gh_secret",
)
```

次を付けた `POST` `Request` を返します。

- `Content-Type`（既定 `application/json`）
- `X-GitHub-Event`
- 正当な `X-Hub-Signature-256`

JSON 以外の `contentType` を渡すと `415` の確認に使えます。

## Tips

- テスト用シークレットは短く固定でよい（テストプロセスの外には出ない）
- ハッピーパスのルーティングは `emitEvent`、暗号やヘッダーのエッジケースは低レベルヘルパー
- `HibikiError` のコード（`HIBIKI_VERIFICATION_FAILED` など）は `response.status` と `await response.text()` で断言する

## 関連

- [テストガイド](/ja/guides/testing)
- [Core リファレンス](/ja/reference/core)
- [Stripe](/ja/reference/stripe) / [GitHub](/ja/reference/github)
