# `@hibiki-js/core`

Core builder, provider contract, and error types.

## `Hibiki`

```ts
import { Hibiki } from "@hibiki-js/core"

const app = new Hibiki({ strictEvents?: boolean })
```

### Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `strictEvents` | `boolean` | `false` | Reject unsupported provider events with `400` instead of `200` |

### Methods

#### `use(provider)`

Returns a new `Hibiki` instance with the provider registered. Throws `HIBIKI_PROVIDER_NOT_REGISTERED` if the same provider name is registered twice.

#### `on(eventName, handler)`

Registers exactly one handler for a typed event such as `stripe.invoice.paid`. Throws `HIBIKI_DUPLICATE_HANDLER` if the event already has a handler.

Handler signature:

```ts
(context: HibikiContext) => Promise<Response | void> | Response | void
```

#### `useMiddleware(middleware)`

Adds middleware that wraps handler execution:

```ts
(context, next) => Promise<void> | void
```

#### `handle(request, options)`

Verifies, parses, and routes a webhook `Request`.

```ts
app.handle(request, {
  provider: "stripe",
  waitUntil?: (promise: Promise<unknown>) => void,
})
```

## `HibikiContext`

| Field | Type | Description |
| --- | --- | --- |
| `event` | typed payload | Parsed provider event |
| `provider` | `string` | Provider name |
| `request` | `Request` | Original request |
| `headers` | `Headers` | Request headers |
| `rawBody` | `string` | Decoded raw body text |
| `id` | `string?` | Optional event id from the provider |
| `waitUntil` | `fn?` | Optional background scheduler |

## `defineProvider`

```ts
defineProvider<TName, TEvents>(provider: HibikiProvider<TName, TEvents>)
```

### `HibikiProvider`

| Member | Description |
| --- | --- |
| `name` | Unique provider id used in event names |
| `contentTypes?` | Allowed media types after verification |
| `verify(input)` | Signature check; throw `HibikiError` on failure |
| `parse(input)` | Return `{ kind: "supported", ... }` or `{ kind: "unsupported", ... }` |

## `HibikiError`

```ts
class HibikiError extends Error {
  readonly code: HibikiErrorCode
  readonly status: number
}
```

HTTP responses use `error.code` as the body text.

## Types

- `EventMap`
- `ParseResult<TEvents>` / `SupportedParseResult<TEvents>`
- `VerifyInput` / `ParseInput`
- `ProviderRegistry`
- `RegisteredEventName<R>`
- `HibikiOptions` / `HandleOptions<R>`
