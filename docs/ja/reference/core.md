# `@hibiki-js/core`

コアのビルダー、プロバイダー契約、エラー型です。

## `Hibiki`

```ts
import { Hibiki } from "@hibiki-js/core"

const app = new Hibiki({ strictEvents?: boolean })
```

### オプション

| オプション | 型 | デフォルト | 説明 |
| --- | --- | --- | --- |
| `strictEvents` | `boolean` | `false` | 未対応イベントを `200` ではなく `400` で拒否する |

### メソッド

#### `use(provider)`

プロバイダーを登録した新しい `Hibiki` インスタンスを返します。同じ名前を二重登録すると `HIBIKI_PROVIDER_NOT_REGISTERED` を投げます。

#### `on(eventName, handler)`

`stripe.invoice.paid` のような型付きイベントに、ハンドラをちょうど 1 つ登録します。既にハンドラがある場合は `HIBIKI_DUPLICATE_HANDLER` を投げます。

ハンドラのシグネチャ:

```ts
(context: HibikiContext) => Promise<Response | void> | Response | void
```

#### `useMiddleware(middleware)`

ハンドラ実行を包むミドルウェアを追加します。

```ts
(context, next) => Promise<void> | void
```

#### `handle(request, options)`

Webhook の `Request` を検証・パース・ルーティングします。

```ts
app.handle(request, {
  provider: "stripe",
  waitUntil?: (promise: Promise<unknown>) => void,
})
```

## `HibikiContext`

| フィールド | 型 | 説明 |
| --- | --- | --- |
| `event` | 型付きペイロード | パース済みイベント |
| `provider` | `string` | プロバイダー名 |
| `request` | `Request` | 元のリクエスト |
| `headers` | `Headers` | リクエストヘッダー |
| `rawBody` | `string` | デコード済みの生 body |
| `id` | `string?` | プロバイダー由来の任意のイベント ID |
| `waitUntil` | `fn?` | 任意のバックグラウンドスケジューラ |

## `defineProvider`

```ts
defineProvider<TName, TEvents>(provider: HibikiProvider<TName, TEvents>)
```

### `HibikiProvider`

| メンバー | 説明 |
| --- | --- |
| `name` | イベント名に使う一意なプロバイダー ID |
| `contentTypes?` | 検証後に許可するメディアタイプ |
| `verify(input)` | 署名チェック。失敗時は `HibikiError` を throw |
| `parse(input)` | `{ kind: "supported", ... }` または `{ kind: "unsupported", ... }` を返す |

## `HibikiError`

```ts
class HibikiError extends Error {
  readonly code: HibikiErrorCode
  readonly status: number
}
```

HTTP レスポンスの body には `error.code` が入ります。

## 型

- `EventMap`
- `ParseResult<TEvents>` / `SupportedParseResult<TEvents>`
- `VerifyInput` / `ParseInput`
- `ProviderRegistry`
- `RegisteredEventName<R>`
- `HibikiOptions` / `HandleOptions<R>`
