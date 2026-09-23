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
