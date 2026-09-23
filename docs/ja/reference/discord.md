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
