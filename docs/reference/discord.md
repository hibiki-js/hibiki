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

The provider also suppresses duplicate interaction IDs in memory for the tolerance window. For multi-instance deployments, use durable application-level idempotency as well.

## Sending messages

Use `createDiscordWebhook(url)` to post JSON messages to an incoming Discord webhook. The URL is the one generated in Discord's channel integration settings.

```ts
import { createDiscordWebhook } from "@hibiki-js/discord"

const webhook = createDiscordWebhook(process.env.DISCORD_WEBHOOK_URL!)
const message = await webhook.send({
  content: "A deployment finished.",
  embeds: [{ title: "Production", color: 0x5865f2 }],
  allowed_mentions: { parse: [] },
})
```

`send` waits for Discord to confirm delivery by default and returns the created message. Pass `{ threadId }` to post in a thread, or `{ wait: false }` to request a fire-and-forget response (`undefined`). Failed HTTP responses throw an error with Discord's message when available. This client sends JSON payloads; file uploads are not included.

| Export | Description |
| --- | --- |
| `createDiscordWebhook` | Create an incoming webhook sender |
| `DiscordWebhookPayload` | JSON message payload |
| `DiscordEmbed` | Rich embed payload |
| `DiscordWebhookMessage` | Message returned by Discord |
| `DiscordWebhookSendOptions` | Per-send `threadId` and `wait` options |
| `DiscordWebhookOptions` | Sender options |

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
