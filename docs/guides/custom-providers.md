# Custom providers

```ts
import { defineProvider, type ParseResult } from "@hibiki-js/core"

interface Events {
  ping: { ok: true }
}

export const example = defineProvider<"example", Events>({
  name: "example",
  async verify() {},
  async parse(): Promise<ParseResult<Events>> {
    return { kind: "supported", eventName: "ping", event: { ok: true } }
  },
})
```

Community packages can ship providers under their own scope, for example `@company/hibiki-example`.
