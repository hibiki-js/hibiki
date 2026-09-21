# `@hibiki-js/hono`

Thin adapter from Hibiki to Hono middleware.

## Install

```bash
pnpm add @hibiki-js/core @hibiki-js/hono hono
```

`hono` is a peer dependency.

## `hibiki(app, provider)`

```ts
import { hibiki } from "@hibiki-js/hono"

app.post("/webhooks/stripe", hibiki(webhooks, "stripe"))
```

Passes `context.req.raw` into `Hibiki#handle` for the given provider name and returns the resulting `Response`.

## Types

Re-exports `RegisteredEventName` from `@hibiki-js/core` for convenience.
