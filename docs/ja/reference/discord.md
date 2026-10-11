# `@hibiki-js/discord`

Discord Interactions 用の Hibiki プロバイダーです。Web Crypto を使って Discord の Ed25519 リクエスト署名を検証し、実行時依存を持ちません。

## インストール

```bash
pnpm add @hibiki-js/core @hibiki-js/discord
```

## `discord(options)`

```ts
const provider = discord({
  publicKey: string,
})
```

`HibikiProvider<"discord", DiscordEvents>` を返します。

| オプション | 型 | 説明 |
| --- | --- | --- |
| `publicKey` | `string` | Discord Developer Portal に表示される64文字の16進数公開鍵 |
| `tolerance` | `number` | 受け付ける署名の最大経過秒数。デフォルトは `300` |

Discord のエンドポイント検証には、`discord.ping` から `{ type: 1 }` を返す必要があります。コマンドやコンポーネントのハンドラでは、たとえば `{ type: 4, data: { content: "Hello" } }` のような [Interaction Response](https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object) JSON を返してください。

プロバイダーは許容時間内で重複するInteraction IDをメモリ上で抑止します。複数インスタンスにまたがる環境では、アプリケーション側でも永続的な冪等性制御を行ってください。

## メッセージの送信

`createDiscordWebhook(url)` を使うと、Discord の受信Webhookへ メッセージを送れます。URL には Discord のチャンネル連携設定で発行したものを指定します。

```ts
import { createDiscordWebhook } from "@hibiki-js/discord"

const webhook = createDiscordWebhook(process.env.DISCORD_WEBHOOK_URL!)
const message = await webhook.send({
  content: "デプロイが完了しました。",
  embeds: [{ title: "Production", color: 0x5865f2 }],
  allowed_mentions: { parse: [] },
})
```

`send` はデフォルトで Discord の送信確認を待ち、作成されたメッセージを返します。スレッドへ送る場合は `{ threadId }`、送信確認を待たない場合は `{ wait: false }` を指定します（戻り値は `undefined`）。`components` を含む場合は、Discord が処理できるよう `with_components=true` を設定します。HTTP エラー時は、取得できれば Discord のエラーメッセージを含む例外を投げます。

| Export | 説明 |
| --- | --- |
| `createDiscordWebhook` | 受信Webhook用の送信クライアントを作成 |
| `DiscordWebhookPayload` | JSON メッセージの型 |
| `DiscordEmbed` | リッチEmbedの型 |
| `DiscordWebhookMessage` | Discord が返すメッセージの型 |
| `DiscordWebhookSendOptions` | 送信ごとの `files` / `threadId` / `wait` オプション |
| `DiscordWebhookFile` | 添付ファイルの型 `{ filename: string, data: Blob }` |
| `DiscordWebhookOptions` | クライアントのオプション |

### ファイルの添付

第2引数の `files` 配列に添付ファイルを指定します。`DiscordWebhookFile` の必須項目は `filename: string` と `data: Blob` です。`data` にはWeb標準の `File` も渡せます。アップロード時の名前には、明示した `filename` が使われます。

```ts
await webhook.send({
  content: "デプロイのレポート",
  embeds: [{ image: { url: "attachment://preview.png" } }],
}, {
  threadId: "123456789",
  wait: true,
  files: [
    { filename: "preview.png", data: new Blob([imageBytes], { type: "image/png" }) },
    { filename: "report.txt", data: new Blob(["デプロイ成功"], { type: "text/plain" }) },
  ],
})
```

ファイルがある場合は `multipart/form-data` で送信し、メッセージを `payload_json`、ファイルを0始まりの `files[n]` フィールドに格納します。ファイルを省略するか `files: []` を指定するとJSON形式で送信します。どちらの形式でも、テキスト、Embed、components、`threadId`、`wait` を併用できます。ファイルだけを送る場合はメッセージに `{}` を指定できます。

実行環境にはWeb標準の `Blob`、`FormData`、`fetch` が必要です（Node.js 22以降では利用できます）。独自の `fetch` を指定する場合も `FormData` を受け付け、`Content-Type` と境界文字列の生成をランタイムに任せてください。ファイルパス、ストリーム、バイト配列は直接渡せません。バイト列は `Blob` に包んでください。添付数やサイズの制限はDiscord側で適用されます。[Execute Webhook](https://discord.com/developers/docs/resources/webhook#execute-webhook) と [Uploading Files](https://discord.com/developers/docs/reference#uploading-files) を参照してください。

説明文を付ける場合は、メッセージの `attachments` にファイルの0始まりの添字と一致する `id` を指定します。例: `{ id: 0, filename: "preview.png", description: "デプロイのプレビュー" }`。クライアントはこのメタデータをそのまま送信します。EmbedのURLからは `attachment://filename` で添付ファイルを参照できます。

## イベント名

| Discord Interaction type | Hibiki イベント名 |
| --- | --- |
| `1` PING | `discord.ping` |
| `2` APPLICATION_COMMAND | `discord.application_command` |
| `3` MESSAGE_COMPONENT | `discord.message_component` |
| `4` APPLICATION_COMMAND_AUTOCOMPLETE | `discord.application_command_autocomplete` |
| `5` MODAL_SUBMIT | `discord.modal_submit` |

## エクスポートする型

| エクスポート | 説明 |
| --- | --- |
| `discord` | プロバイダーファクトリ |
| `DiscordEvents` | 対応イベント名 → Interaction payload のマップ |
| `DiscordInteraction` | 型付けされた Discord Interaction payload |
| `DiscordInteractionType` | 対応する数値の Interaction type |
| `DiscordOptions` | `{ publicKey: string }` |
