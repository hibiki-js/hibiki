# Discord

`@hibiki-js/discord` receives [Discord Interactions](https://discord.com/developers/docs/interactions/overview) and verifies their Ed25519 signatures with Web Crypto.

```ts
import { Hibiki } from "@hibiki-js/core"
import { discord } from "@hibiki-js/discord"

const app = new Hibiki().use(discord({
  // Discord Developer Portal → General Information → Public Key
  publicKey: process.env.DISCORD_PUBLIC_KEY!,
}))

// Required for Discord endpoint URL validation.
app.on("discord.ping", () => Response.json({ type: 1 }))

app.on("discord.application_command", ({ event }) => {
  if (event.data?.name === "hello") {
    return Response.json({ type: 4, data: { content: "Hello!" } })
  }
})

export const POST = (request: Request) => app.handle(request, { provider: "discord" })
```

Set the resulting public URL as the **Interactions Endpoint URL** in the Discord Developer Portal. Discord expects an initial response within three seconds; return an interaction response from the handler or defer it with response type `5`.

## Supported events

- `ping`
- `application_command`
- `message_component`
- `application_command_autocomplete`
- `modal_submit`

All payloads must be `application/json`. Hibiki verifies `X-Signature-Ed25519` against the raw bytes of `X-Signature-Timestamp` concatenated with the raw request body, before parsing it. Signatures older than five minutes are rejected by default, and duplicate interaction IDs are ignored for that same period within a provider instance. Use durable application-level idempotency when requests can reach multiple instances. Unsupported interaction types return 200 by default (or 400 with `strictEvents: true`).

For options and exported types, see the [API reference](/reference/discord).
