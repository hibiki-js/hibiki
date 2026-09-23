# Discord

`@hibiki-js/discord` は [Discord Interactions](https://discord.com/developers/docs/interactions/overview) を受信し、Web Crypto で Ed25519 署名を検証します。

```ts
import { Hibiki } from "@hibiki-js/core"
import { discord } from "@hibiki-js/discord"

const app = new Hibiki().use(discord({
  // Discord Developer Portal → General Information → Public Key
  publicKey: process.env.DISCORD_PUBLIC_KEY!,
}))

// Discord のエンドポイントURL検証に必要です。
app.on("discord.ping", () => Response.json({ type: 1 }))

app.on("discord.application_command", ({ event }) => {
  if (event.data?.name === "hello") {
    return Response.json({ type: 4, data: { content: "こんにちは！" } })
  }
})

export const POST = (request: Request) => app.handle(request, { provider: "discord" })
```

公開URLを Discord Developer Portal の **Interactions Endpoint URL** に設定してください。Discord は3秒以内の初回応答を求めます。ハンドラから Interaction response を返すか、type `5` で応答を延期します。

## 対応イベント

- `ping`
- `application_command`
- `message_component`
- `application_command_autocomplete`
- `modal_submit`

ペイロードは `application/json` のみ受け付けます。Hibiki はパース前に、`X-Signature-Timestamp` と生のリクエストボディを連結したバイト列に対して `X-Signature-Ed25519` を検証します。署名はデフォルトで5分を超えると拒否し、同じInteraction IDは同じプロバイダーインスタンス内でその期間中に再処理しません。複数インスタンスにまたがる場合は、アプリケーション側で永続的な冪等性制御も行ってください。未対応の Interaction type はデフォルトで200を返します（`strictEvents: true` では400）。

オプションと型の詳細は [API リファレンス](/ja/reference/discord) を参照してください。
