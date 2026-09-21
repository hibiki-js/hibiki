# `@hibiki-js/core`

Hibiki の中核パッケージです。不変なアプリビルダー、プロバイダー契約、リクエストの振り分け、安定したエラーコードを担当します。`@hibiki-js/stripe` や `@hibiki-js/github` などのプロバイダーは、この API に接続します。

扱うのは Web Standards の `Request` / `Response` だけです。環境変数の読み取り、ペイロードのログ、キュー、再送は行いません。

## インストール

```bash
pnpm add @hibiki-js/core
```

Node.js 22+、または Web Crypto と `Request` / `Response` があるランタイム（Cloudflare Workers、Deno、Bun など）。

## 短い例

```ts
import { Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"

const app = new Hibiki()
  .use(stripe({ secret: process.env.STRIPE_WEBHOOK_SECRET! }))

app.on("stripe.invoice.paid", async ({ event }) => {
  console.log(event.data.object.id)
})

export async function POST(request: Request) {
  return app.handle(request, { provider: "stripe" })
}
```

## `Hibiki`

```ts
import { Hibiki } from "@hibiki-js/core"

const app = new Hibiki(options?)
```

`Hibiki` は型状態付きの不変ビルダーです。`use()` は**新しい**インスタンスを返し、元のインスタンスは変わりません。プロバイダー登録後の `on()` は、登録済みプロバイダー上のイベント名だけを受け付けます。

### オプション

| オプション | 型 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `strictEvents` | `boolean` | `false` | `true` のとき、未対応イベントを `200` ではなく `400`（`HIBIKI_UNSUPPORTED_EVENT`）で返す |

### `use(provider)`

プロバイダーを登録し、型レジストリを更新した新しい `Hibiki` を返します。

```ts
const app = new Hibiki()
  .use(stripe({ secret }))
  .use(github({ secret: githubSecret }))
```

- 同じ `provider.name` を二重登録すると `HIBIKI_PROVIDER_NOT_REGISTERED`（status `500`）を投げる
- 直前のビルダーは変更しない

### `on(eventName, handler)`

`stripe.invoice.paid` や `github.pull_request.opened` のような型付きイベントに、ハンドラをちょうど 1 つ登録します。

```ts
app.on("stripe.checkout.session.completed", async (context) => {
  // context.event はその Stripe ペイロードに絞り込まれる
  console.log(context.event.data.object.id)
})
```

ハンドラのシグネチャ:

```ts
(context: HibikiContext) => Promise<Response | void> | Response | void
```

- `this` を返すので登録をチェーンできる
- 同じイベントに再度登録すると `HIBIKI_DUPLICATE_HANDLER`（status `500`）
- `Response` を返した場合はそのまま応答する
- `void` / `undefined` の場合は `204`

### `useMiddleware(middleware)`

**登録済みハンドラ**の実行だけを包むミドルウェアを追加します。署名失敗、未対応 Content-Type、パース失敗、未対応イベントでは動きません。

```ts
app.useMiddleware(async (context, next) => {
  const start = performance.now()
  await next()
  console.log(context.provider, context.id, performance.now() - start)
})
```

シグネチャ:

```ts
(context: HibikiContext, next: () => Promise<void>) => Promise<void> | void
```

登録順に実行されます。通常の応答にするなら、意図的に打ち切る場合を除き `await next()` してください。

### `handle(request, options)`

Webhook の `Request` を検証・パース・振り分けし、`Response` を返します。

```ts
await app.handle(request, {
  provider: "stripe",
  waitUntil?: (promise: Promise<unknown>) => void,
})
```

| オプション | 必須 | 説明 |
| --- | --- | --- |
| `provider` | はい | 登録済みプロバイダー名（`"stripe"`、`"github"` など） |
| `waitUntil` | いいえ | 任意のバックグラウンドスケジューラ（Cloudflare Workers の `ctx.waitUntil` など）。渡すと `HibikiContext` に載る |

毎回の処理順:

1. 名前付きプロバイダーを解決する
2. クローンした `Request` から生 body を読む
3. `provider.verify(...)`
4. プロバイダーが `contentTypes` を持つ場合は検査する
5. `provider.parse(...)`
6. 対応ハンドラへ渡す（ミドルウェア込み）。未対応・未登録なら早期に返す

## 既定の HTTP 応答

| 状況 | ステータス | Body |
| --- | --- | --- |
| 対応イベントでハンドラが void | `204` | 空 |
| 対応イベントだがハンドラ未登録 | `204` | 空 |
| 未対応イベント（`strictEvents: false`） | `200` | 空 |
| 未対応イベント（`strictEvents: true`） | `400` | `HIBIKI_UNSUPPORTED_EVENT` |
| ハンドラが `Response` を返す | そのステータス | その body |
| `HibikiError` | `error.status` | `error.code`（プレーンテキスト） |
| `HibikiError` 以外の予期しない throw | `500` | `Internal webhook error` |

未対応イベントへの `200` は意図的です。まだ扱っていないイベント種別で、Stripe / GitHub などが無限に再送しないようにするためです。

## `HibikiContext`

ハンドラとミドルウェアに渡されます。

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `event` | 型付きペイロード | このハンドラ向けにパース済みのイベント |
| `provider` | `string` | プロバイダー名（`"stripe"` など） |
| `request` | `Request` | 元のリクエスト |
| `headers` | `Headers` | `request.headers` と同じ |
| `rawBody` | `string` | パースに使った UTF-8 の生 body |
| `id` | `string?` | プロバイダーが渡す任意のイベント ID（Stripe は `event.id`） |
| `waitUntil` | `((promise: Promise<unknown>) => void)?` | `handle` に `waitUntil` を渡したときだけ存在 |

## `defineProvider` / `HibikiProvider`

独自プロバイダーを出すときは `defineProvider` を使います。型付きの identity ヘルパーで、実行時の特別な処理はありません。

```ts
import { defineProvider, HibikiError, type ParseResult } from "@hibiki-js/core"

interface Events {
  ping: { ok: true }
}

export const example = defineProvider<"example", Events>({
  name: "example",
  contentTypes: ["application/json"],
  async verify({ headers }) {
    if (!headers.get("x-example-signature")) {
      throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Missing signature", 400)
    }
  },
  async parse(): Promise<ParseResult<Events>> {
    return { kind: "supported", eventName: "ping", event: { ok: true } }
  },
})
```

### `HibikiProvider` のメンバー

| メンバー | 説明 |
| --- | --- |
| `name` | 一意なプロバイダー ID。イベント名の接頭辞（`name.event`）になる |
| `contentTypes?` | 検証**後**に許可するメディアタイプ。`;` より前を小文字比較する |
| `verify(input)` | 署名・正当性チェック。失敗時は `HibikiError` を throw |
| `parse(input)` | `{ kind: "supported", eventName, event, id? }` または `{ kind: "unsupported", nativeEventName, id? }` を返す |

### `VerifyInput` / `ParseInput`

| フィールド | 対象 | 説明 |
| --- | --- | --- |
| `rawBody` | 両方 | 生のリクエストバイト（`Uint8Array`） |
| `headers` | 両方 | リクエストヘッダー |
| `request` | 両方 | 元の `Request` |
| `text` | parse のみ | UTF-8 デコード済み body |

## `HibikiError`

```ts
class HibikiError extends Error {
  readonly code: HibikiErrorCode
  readonly status: number
}
```

HTTP 応答の body は **`error.code` だけ**です。呼び出し側に見える想定のメッセージに秘密情報やペイロード詳細を載せないでください。返るのはコード文字列です。

| コード | 典型的な status | タイミング |
| --- | --- | --- |
| `HIBIKI_VERIFICATION_FAILED` | `400` | 署名・正当性チェック失敗 |
| `HIBIKI_PARSE_FAILED` | `400` | プロバイダーの `parse` が `HibikiError` 以外を throw |
| `HIBIKI_UNSUPPORTED_EVENT` | `400` | `strictEvents: true` で未対応イベント |
| `HIBIKI_UNSUPPORTED_CONTENT_TYPE` | `415` | `Content-Type` が `provider.contentTypes` にない |
| `HIBIKI_PROVIDER_NOT_REGISTERED` | `500` | 不明なプロバイダー名、または `use()` の二重登録 |
| `HIBIKI_DUPLICATE_HANDLER` | `500` | 同じイベントへの 2 回目の `on()` |
| `HIBIKI_HANDLER_FAILED` | `500` | ハンドラまたはミドルウェアが throw |

## よく使う型

| 型 | 役割 |
| --- | --- |
| `EventMap` | プロバイダーのイベントマップ制約 |
| `ParseResult<TEvents>` / `SupportedParseResult<TEvents>` | `parse` の戻り値型 |
| `ProviderRegistry` | 登録済みプロバイダーのマップ |
| `RegisteredEventName<R>` | レジストリ `R` 向けの `"provider.event"` ユニオン |
| `HibikiOptions` / `HandleOptions<R>` | コンストラクタ / `handle` のオプション型 |

## 関連

- [コンセプト](/ja/guide/concepts) — ビルダー、ミドルウェア、独自プロバイダー
- [エラー処理](/ja/guide/error-handling) — 応答一覧と `strictEvents`
- [Stripe](/ja/reference/stripe) / [GitHub](/ja/reference/github) — プロバイダー
- [Testing](/ja/reference/testing) — 署名付きリクエストのヘルパー
