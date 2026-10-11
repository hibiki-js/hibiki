# `@hibiki-js/discord`

Discord Interactions provider for Hibiki. It validates Discord's Ed25519 request signature using Web Crypto and has no runtime dependencies.

## Install

```bash
pnpm add @hibiki-js/core @hibiki-js/discord
```

## `discord(options)`

```ts
const provider = discord({
  publicKey: string,
})
```

Returns `HibikiProvider<"discord", DiscordEvents>`.

| Option | Type | Description |
| --- | --- | --- |
| `publicKey` | `string` | The 64-character hexadecimal public key from the Discord Developer Portal |
| `tolerance` | `number` | Maximum accepted signature age in seconds; defaults to `300` |

`discord.ping` must return `{ type: 1 }` for Discord's endpoint validation. Command and component handlers should return the appropriate [Interaction Response](https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-response-object) JSON, for example `{ type: 4, data: { content: "Hello" } }`.

Hibiki Core suppresses duplicate authenticated interaction IDs after successful handler execution. The default memory store retains completed IDs for 24 hours; use shared durable storage across instances.

## Sending messages

Use `createDiscordWebhook(url)` to post messages to an incoming Discord webhook. The URL is the one generated in Discord's channel integration settings.

```ts
import { createDiscordWebhook } from "@hibiki-js/discord"

const webhook = createDiscordWebhook(process.env.DISCORD_WEBHOOK_URL!)
const message = await webhook.send({
  content: "A deployment finished.",
  embeds: [{ title: "Production", color: 0x5865f2 }],
  allowed_mentions: { parse: [] },
})
```

`send` waits for Discord to confirm delivery by default and returns the created message. Pass `{ threadId }` to post in a thread, or `{ wait: false }` to request a fire-and-forget response (`undefined`). If `components` are present, the client sets `with_components=true` so Discord processes them. Failed HTTP responses throw an error with Discord's message when available.

| Export | Description |
| --- | --- |
| `createDiscordWebhook` | Create an incoming webhook sender |
| `DiscordWebhookPayload` | JSON message payload |
| `DiscordEmbed` | Rich embed payload |
| `DiscordWebhookMessage` | Message returned by Discord |
| `DiscordWebhookSendOptions` | Per-send `files`, `threadId`, and `wait` options |
| `DiscordWebhookFile` | `{ filename: string, data: Blob }` upload |
| `DiscordWebhookOptions` | Sender options |

### File attachments

Pass a `files` array in the second argument. Each `DiscordWebhookFile` has a required `filename: string` and `data: Blob`; a Web standard `File` can also be used as `data`. The explicit `filename` determines the uploaded name.

```ts
await webhook.send({
  content: "Deployment report",
  embeds: [{ image: { url: "attachment://preview.png" } }],
}, {
  threadId: "123456789",
  wait: true,
  files: [
    { filename: "preview.png", data: new Blob([imageBytes], { type: "image/png" }) },
    { filename: "report.txt", data: new Blob(["Deployment succeeded"], { type: "text/plain" }) },
  ],
})
```

With files, the client sends `multipart/form-data` containing `payload_json` and zero-indexed `files[n]` fields. Without files (or with `files: []`), it sends JSON. Text, embeds, components, `threadId`, and `wait` work with either transport. A file-only message can use `{}` as its payload.

The runtime must provide Web standard `Blob`, `FormData`, and `fetch` (Node.js 22+ does). A custom `fetch` must accept `FormData` and let the runtime generate `Content-Type` and its boundary. Paths, streams, and raw byte arrays are not accepted directly; wrap bytes in a `Blob`. Upload count and size limits are enforced by Discord; see [Execute Webhook](https://discord.com/developers/docs/resources/webhook#execute-webhook) and [Uploading Files](https://discord.com/developers/docs/reference#uploading-files).

To add descriptions, supply `attachments` in the message payload with an `id` matching the file's zero-based index, for example `{ id: 0, filename: "preview.png", description: "Deployment preview" }`. The client preserves this metadata as supplied. Embed URLs can reference an uploaded filename using `attachment://filename`.

## Event names

| Discord interaction type | Hibiki event name |
| --- | --- |
| `1` PING | `discord.ping` |
| `2` APPLICATION_COMMAND | `discord.application_command` |
| `3` MESSAGE_COMPONENT | `discord.message_component` |
| `4` APPLICATION_COMMAND_AUTOCOMPLETE | `discord.application_command_autocomplete` |
| `5` MODAL_SUBMIT | `discord.modal_submit` |

## Exported types

| Export | Description |
| --- | --- |
| `discord` | Provider factory |
| `DiscordEvents` | Supported event name → interaction payload map |
| `DiscordInteraction` | Typed Discord interaction payload |
| `DiscordInteractionType` | Supported numeric interaction type |
| `DiscordOptions` | `{ publicKey: string }` |

For body limits, authenticated event IDs, shared deduplication, and retry behavior, see [Secure webhook handling](../guides/security).
