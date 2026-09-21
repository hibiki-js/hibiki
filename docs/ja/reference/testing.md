# `@hibiki-js/testing`

テスト用に署名付き Webhook リクエストを作るヘルパーです。

## インストール

```bash
pnpm add -D @hibiki-js/testing
```

## `createWebhookTest(app, options)`

```ts
import { createWebhookTest } from "@hibiki-js/testing"

const webhook = createWebhookTest(app, {
  secrets: { stripe: "whsec_test", github: "gh_secret" },
})
```

### `emit(request, provider)`

生の `Request` を `app.handle` に転送します。

### `emitEvent(eventName, payload?)`

`stripe.checkout.session.completed` や `github.push` のような Hibiki イベント名向けに署名付きリクエストを組み立て、`handle` を呼びます。

Stripe では、`payload` が完全なイベントエンベロープでない場合、次のように包みます。

```ts
{ id: "evt_test", type: nativeEventName, data: { object: payload } }
```

GitHub のアクション付きイベントでは、欠けている `action` を補います。

## 低レベルヘルパー

### `stripeRequest(payload, secret, timestamp?)`

有効な `Stripe-Signature` ヘッダー付きの `Request` を返します。

### `githubRequest(payload, event, secret, contentType?)`

`X-GitHub-Event` と `X-Hub-Signature-256` 付きの `Request` を返します。
