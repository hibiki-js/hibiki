# `@hibiki-js/hono`

Hibiki を Hono ミドルウェアへつなぐ薄いアダプターです。

## インストール

```bash
pnpm add @hibiki-js/core @hibiki-js/hono hono
```

`hono` は peer dependency です。

## `hibiki(app, provider)`

```ts
import { hibiki } from "@hibiki-js/hono"

app.post("/webhooks/stripe", hibiki(webhooks, "stripe"))
```

指定したプロバイダー名で `context.req.raw` を `Hibiki#handle` に渡し、その `Response` を返します。

## 型

便宜上、`@hibiki-js/core` から `RegisteredEventName` を再エクスポートします。
