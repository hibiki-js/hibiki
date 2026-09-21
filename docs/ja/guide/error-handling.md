# エラー処理

Hibiki は失敗を安定した `HibikiError` コードにマップし、レスポンス body にそのコード文字列を返します。

| コード | 典型的な status |
| --- | --- |
| `HIBIKI_VERIFICATION_FAILED` | 400 |
| `HIBIKI_PARSE_FAILED` | 400 |
| `HIBIKI_UNSUPPORTED_EVENT` | `strictEvents: true` のとき 400 |
| `HIBIKI_UNSUPPORTED_CONTENT_TYPE` | 415 |
| `HIBIKI_PROVIDER_NOT_REGISTERED` | 500 |
| `HIBIKI_DUPLICATE_HANDLER` | 500 |
| `HIBIKI_HANDLER_FAILED` | 500 |

## 未対応イベント

プロバイダーの未対応イベントは、無限リトライを避けるためデフォルトで **200** を返します。`strictEvents: true` にすると 400 で拒否します。

```ts
const app = new Hibiki({ strictEvents: true }).use(stripe({ secret }))
```

## ハンドラの失敗

登録済みハンドラが throw すると、Hibiki は body `HIBIKI_HANDLER_FAILED` の `500` を返します。`HibikiError` 以外の想定外エラーは、内部情報を漏らさない汎用の `500 Internal webhook error` になります。
