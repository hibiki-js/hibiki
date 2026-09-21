# コンセプト

## イミュータブルなビルダー

`Hibiki` は型状態を持つビルダーです。`use()` はプロバイダーを追加した新しいインスタンスを返し、元のビルダーは変わりません。プロバイダーを登録すると、`on()` はそのプロバイダーに存在するイベント名だけを受け付けます。

```ts
const app = new Hibiki()
  .use(stripe({ secret }))
  .use(github({ secret: githubSecret }))

// "stripe.*" | "github.*" に型付けされる
app.on("stripe.invoice.paid", ({ event }) => {
  console.log(event.data.object.id)
})
```

## リクエストのパイプライン

`handle()` のたびに次の順で動きます。

1. 指定した名前のプロバイダーを解決する
2. Web Crypto（`crypto.subtle`）で署名を検証する
3. 必要なら `contentTypes` を検査する
4. ペイロードをパースする
5. ちょうど 1 つのハンドラへルーティングし、ミドルウェアで包む

シークレットは常に呼び出し側が渡します。Hibiki 自身は環境変数を読みません。

## ハンドラとレスポンス

| 状況 | デフォルトのレスポンス |
| --- | --- |
| 対応イベントでハンドラが void を返す | `204` |
| 対応イベントだがハンドラ未登録 | `204` |
| プロバイダーの未対応イベント | `200`（無限リトライを避けるため） |
| ハンドラが `Response` を返す | そのレスポンス |

コンストラクタに `{ strictEvents: true }` を渡すと、未対応イベントは `HIBIKI_UNSUPPORTED_EVENT` 付きの `400` になります。

## ミドルウェア

ミドルウェアは登録済みハンドラの実行だけを包みます。署名検証失敗や未対応イベントでは動きません。

```ts
app.useMiddleware(async (context, next) => {
  const start = performance.now()
  await next()
  console.log(context.provider, performance.now() - start)
})
```

ログ・メトリクス・トレーシングはミドルウェアに置いてください。Hibiki 自体はログを出しません。

## カスタムプロバイダー

```ts
import { defineProvider, type ParseResult } from "@hibiki-js/core"

interface Events {
  ping: { ok: true }
}

export const example = defineProvider<"example", Events>({
  name: "example",
  async verify() {},
  async parse(): Promise<ParseResult<Events>> {
    return { kind: "supported", eventName: "ping", event: { ok: true } }
  },
})
```

コミュニティパッケージは `@company/hibiki-example` のように独自スコープで公開できます。

## 署名検証

- 生の body バイトは clone した `Request` から取る
- 検証には Web Crypto を使う
- 暗号の内部詳細は HTTP レスポンスに出さない
- 各プロバイダーパッケージは公式の Webhook 署名方式に従う
