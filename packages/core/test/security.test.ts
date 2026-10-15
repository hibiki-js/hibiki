import { describe, expect, it, vi } from "vitest"
import { readBody } from "../src/body.js"
import { createMemoryIdempotencyStore, defineProvider, Hibiki, HibikiError } from "../src/index.js"

const eventProvider = defineProvider<"example", { ping: { id: string } }>({
  name: "example",
  async verify({ headers }) {
    if (headers.get("invalid")) throw new HibikiError("HIBIKI_VERIFICATION_FAILED", "Invalid", 400)
  },
  async parse({ text }) { return { kind: "supported", eventName: "ping", event: { id: text }, id: text } },
})
const request = (body = "event-1") => new Request("https://test", { method: "POST", body })
const handle = (app: Hibiki<{ example: typeof eventProvider }>, body = "event-1") => app.handle(request(body), { provider: "example" })

describe("Webhook resource limits", () => {
  it("rejects excessive declared lengths without verifying", async () => {
    const verify = vi.fn(async () => {})
    const app = new Hibiki({ maxBodyBytes: 4 }).use({ ...eventProvider, verify })
    const req = new Request("https://test", { method: "POST", body: "ok", headers: { "content-length": "5" } })
    const response = await app.handle(req, { provider: "example" })
    expect(response.status).toBe(413)
    expect(await response.text()).toBe("HIBIKI_PAYLOAD_TOO_LARGE")
    expect(verify).not.toHaveBeenCalled()
    expect(await req.text()).toBe("ok")
  })

  it.each([undefined, "1", "garbage"])("bounds chunked bytes with Content-Length %s", async (contentLength) => {
    const verify = vi.fn(async () => {})
    const app = new Hibiki({ maxBodyBytes: 4 }).use({ ...eventProvider, verify })
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123"))
        controller.enqueue(new TextEncoder().encode("45"))
        controller.close()
      },
    })
    const req = new Request("https://test", {
      method: "POST", body, headers: contentLength ? { "content-length": contentLength } : {},
      ...({ duplex: "half" } as {}),
    })
    expect((await app.handle(req, { provider: "example" })).status).toBe(413)
    expect(verify).not.toHaveBeenCalled()
  })

  it("verifies and handles an empty request body", async () => {
    const verify = vi.fn(async ({ rawBody }: { rawBody: Uint8Array }) => {
      expect(rawBody.byteLength).toBe(0)
    })
    const app = new Hibiki().use({ ...eventProvider, verify })
    const handler = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.text()).toBe("")
    })
    app.on("example.ping", handler)
    const req = new Request("https://test", { method: "POST" })
    expect((await app.handle(req, { provider: "example" })).status).toBe(204)
    expect(verify).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("accepts exactly the limit and preserves raw request bytes", async () => {
    const app = new Hibiki({ maxBodyBytes: 4 }).use(eventProvider)
    app.on("example.ping", async ({ request }) => { expect(await request.text()).toBe("1234") })
    expect((await handle(app, "1234")).status).toBe(204)
  })

  it("returns owned bytes without changing the source stream or original request", async () => {
    const chunk = new TextEncoder().encode("1234")
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(chunk); controller.close() } })
    const req = new Request("https://test", { method: "POST", body, ...({ duplex: "half" } as {}) })
    const bytes = await readBody(req, 4)
    expect([...bytes]).toEqual([...chunk])
    bytes.fill(0)
    expect(new TextDecoder().decode(chunk)).toBe("1234")
    expect(await req.text()).toBe("1234")
  })

  it("preserves bytes at the limit across empty and multiple stream chunks", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of [new Uint8Array(), new Uint8Array([0, 255]), new Uint8Array([128, 1])]) controller.enqueue(chunk)
        controller.close()
      },
    })
    const req = new Request("https://test", { method: "POST", body, ...({ duplex: "half" } as {}) })
    expect([...await readBody(req, 4)]).toEqual([0, 255, 128, 1])
    expect([...new Uint8Array(await req.arrayBuffer())]).toEqual([0, 255, 128, 1])
  })

  it.each([0, -1, NaN, Infinity, 1.5])("rejects invalid limits: %s", (maxBodyBytes) => {
    expect(() => new Hibiki({ maxBodyBytes })).toThrow(TypeError)
  })
})

describe("Authenticated event idempotency", () => {
  it("executes completed events only once", async () => {
    const app = new Hibiki().use(eventProvider)
    const handler = vi.fn(() => {})
    app.on("example.ping", handler)
    expect((await handle(app)).status).toBe(204)
    expect((await handle(app)).status).toBe(204)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("returns retryable 503 for concurrent duplicates", async () => {
    let finish!: () => void
    let entered!: () => void
    const started = new Promise<void>(resolve => { entered = resolve })
    const blocked = new Promise<void>(resolve => { finish = resolve })
    const app = new Hibiki().use(eventProvider)
    const handler = vi.fn(async () => { entered(); await blocked })
    app.on("example.ping", handler)
    const first = handle(app)
    await started
    const duplicate = await handle(app)
    expect(duplicate.status).toBe(503)
    expect(await duplicate.text()).toBe("HIBIKI_EVENT_IN_PROGRESS")
    finish()
    expect((await first).status).toBe(204)
    expect((await handle(app)).status).toBe(204)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it.each(["throw", "response"])("allows retries after handler %s failure", async (mode) => {
    const app = new Hibiki().use(eventProvider)
    let calls = 0
    app.on("example.ping", () => {
      if (++calls === 1) {
        if (mode === "throw") throw new Error("failed")
        return new Response(null, { status: 500 })
      }
    })
    expect((await handle(app)).status).toBe(500)
    expect((await handle(app)).status).toBe(204)
    expect((await handle(app)).status).toBe(204)
    expect(calls).toBe(2)
  })

  it("does not consume IDs for invalid signatures", async () => {
    const app = new Hibiki().use(eventProvider)
    const handler = vi.fn(() => {})
    app.on("example.ping", handler)
    const invalid = request()
    invalid.headers.set("invalid", "true")
    expect((await app.handle(invalid, { provider: "example" })).status).toBe(400)
    expect((await handle(app)).status).toBe(204)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("shares claims across applications using the same store", async () => {
    const idempotencyStore = createMemoryIdempotencyStore()
    const handler = vi.fn(() => {})
    const a = new Hibiki({ idempotencyStore }).use(eventProvider).on("example.ping", handler)
    const b = new Hibiki({ idempotencyStore }).use(eventProvider).on("example.ping", handler)
    await handle(a)
    await handle(b)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("fails closed when a shared store is unavailable", async () => {
    const handler = vi.fn(() => {})
    const app = new Hibiki({ idempotencyStore: {
      async claim() { throw new Error("connection failed") }, async complete() {}, async release() {},
    } }).use(eventProvider).on("example.ping", handler)
    expect((await handle(app)).status).toBe(503)
    expect(handler).not.toHaveBeenCalled()
  })

  it("keeps a failed handler claimed when the store cannot release it", async () => {
    const memory = createMemoryIdempotencyStore()
    const release = vi.fn(async () => { throw new Error("storage failed") })
    const handler = vi.fn(() => { throw new Error("handler failed") })
    const app = new Hibiki({ idempotencyStore: { ...memory, release } })
      .use(eventProvider).on("example.ping", handler)
    const response = await handle(app)
    expect(response.status).toBe(503)
    expect(await response.text()).toBe("HIBIKI_IDEMPOTENCY_UNAVAILABLE")
    expect((await handle(app)).status).toBe(503)
    expect(release).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it("keeps a claim pending when releasing an unsuccessful Response fails", async () => {
    const memory = createMemoryIdempotencyStore()
    const release = vi.fn(async () => { throw new Error("storage failed") })
    const handler = vi.fn(() => new Response(null, { status: 500 }))
    const app = new Hibiki({ idempotencyStore: { ...memory, release } })
      .use(eventProvider).on("example.ping", handler)
    const response = await handle(app)
    expect(response.status).toBe(503)
    expect(await response.text()).toBe("HIBIKI_IDEMPOTENCY_UNAVAILABLE")
    const retry = await handle(app)
    expect(retry.status).toBe(503)
    expect(await retry.text()).toBe("HIBIKI_EVENT_IN_PROGRESS")
    expect(handler).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("keeps successful effects claimed when completion storage fails", async () => {
    const memory = createMemoryIdempotencyStore()
    const release = vi.fn(memory.release)
    const handler = vi.fn(() => {})
    const app = new Hibiki({ idempotencyStore: {
      claim: memory.claim,
      async complete() { throw new Error("storage failed") },
      release,
    } }).use(eventProvider).on("example.ping", handler)
    expect((await handle(app)).status).toBe(503)
    expect((await handle(app)).status).toBe(503)
    expect(release).not.toHaveBeenCalled()
    expect(handler).toHaveBeenCalledTimes(1)
  })

})

describe("Bounded memory store", () => {
  it("expires in completion order and does not extend retention on repeated completion", async () => {
    vi.useFakeTimers()
    try {
      const store = createMemoryIdempotencyStore({ maxEntries: 2, retentionMs: 100 })
      const first = await store.claim("first"), second = await store.claim("second")
      if (first.status !== "acquired" || second.status !== "acquired") throw new Error("Unexpected claim")
      await store.complete("second", second.token)
      vi.advanceTimersByTime(50)
      await store.complete("first", first.token)
      await store.complete("second", second.token)
      vi.advanceTimersByTime(50)
      expect((await store.claim("first")).status).toBe("completed")
      const renewed = await store.claim("second")
      if (renewed.status !== "acquired") throw new Error("Repeated completion extended retention")
      await store.complete("second", second.token)
      expect((await store.claim("second")).status).toBe("pending")
      await store.complete("second", renewed.token)
      vi.advanceTimersByTime(50)
      expect((await store.claim("first")).status).toBe("acquired")
      expect((await store.claim("second")).status).toBe("completed")
      vi.advanceTimersByTime(50)
      expect((await store.claim("second")).status).toBe("acquired")
    } finally { vi.useRealTimers() }
  })

  it("reclaims expired middle and last IDs after clock rollback without removing live IDs", async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(0)
      const store = createMemoryIdempotencyStore({ retentionMs: 100, maxEntries: 4 })
      const tokens: Record<string, string> = {}
      for (const key of ["live", "first", "middle", "last"]) {
        const claim = await store.claim(key)
        if (claim.status !== "acquired") throw new Error("Unexpected claim")
        tokens[key] = claim.token
      }
      vi.setSystemTime(1000)
      await store.complete("live", tokens.live!)
      vi.setSystemTime(0)
      for (const key of ["first", "middle", "last"]) await store.complete(key, tokens[key]!)
      vi.setSystemTime(100)
      for (const key of ["middle", "last", "first"]) {
        const renewed = await store.claim(key)
        if (renewed.status !== "acquired") throw new Error("Expired ID was not reclaimed")
        await store.complete(key, tokens[key]!)
        await store.release(key, tokens[key]!)
        expect((await store.claim(key)).status).toBe("pending")
        await store.complete(key, renewed.token)
      }
      expect((await store.claim("live")).status).toBe("completed")
      await expect(store.claim("full")).rejects.toMatchObject({ status: 503 })
      vi.setSystemTime(1100)
      const drained = await store.claim("live")
      if (drained.status !== "acquired") throw new Error("Expired queue was not drained")
      await store.complete("live", drained.token)
      expect((await store.claim("live")).status).toBe("completed")
    } finally { vi.useRealTimers() }
  })

  it.each([0, -1, NaN, Infinity])("rejects invalid retention: %s", retentionMs => {
    expect(() => createMemoryIdempotencyStore({ retentionMs })).toThrow("retentionMs must be a positive finite number")
  })

  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid capacity: %s", maxEntries => {
    expect(() => createMemoryIdempotencyStore({ maxEntries })).toThrow("maxEntries must be a positive safe integer")
  })

  it("retains completed entries until expiry and rejects new IDs at capacity", async () => {
    vi.useFakeTimers()
    try {
      const store = createMemoryIdempotencyStore({ maxEntries: 1, retentionMs: 100 })
      const claim = await store.claim("one")
      expect(claim.status).toBe("acquired")
      if (claim.status !== "acquired") throw new Error("Unexpected claim")
      await store.complete("one", "wrong-token")
      expect((await store.claim("one")).status).toBe("pending")
      await store.complete("one", claim.token)
      await store.release("one", claim.token)
      expect((await store.claim("one")).status).toBe("completed")
      await expect(store.claim("two")).rejects.toMatchObject({ status: 503 })
      vi.advanceTimersByTime(100)
      expect((await store.claim("two")).status).toBe("acquired")
    } finally { vi.useRealTimers() }
  })

  it("reclaims a requested expired ID beyond the cleanup batch without accepting stale tokens", async () => {
    vi.useFakeTimers()
    try {
      const store = createMemoryIdempotencyStore({ maxEntries: 260, retentionMs: 100 })
      const tokens = []
      for (let i = 0; i < 260; i++) {
        const claim = await store.claim(String(i))
        if (claim.status !== "acquired") throw new Error("Unexpected claim")
        tokens.push(claim.token)
        await store.complete(String(i), claim.token)
      }
      vi.advanceTimersByTime(100)
      const renewed = await store.claim("259")
      if (renewed.status !== "acquired") throw new Error("Expired ID was not reclaimed")
      expect(renewed.token).not.toBe(tokens[259])
      await store.complete("259", tokens[259]!)
      await store.release("259", tokens[259]!)
      expect((await store.claim("259")).status).toBe("pending")
      await store.complete("259", renewed.token)
      expect((await store.claim("259")).status).toBe("completed")
    } finally { vi.useRealTimers() }
  })

  it("frees capacity across cleanup batches while preserving live completed and pending IDs", async () => {
    vi.useFakeTimers()
    try {
      const store = createMemoryIdempotencyStore({ maxEntries: 300, retentionMs: 100 })
      for (let i = 0; i < 298; i++) {
        const claim = await store.claim(String(i))
        if (claim.status !== "acquired") throw new Error("Unexpected claim")
        await store.complete(String(i), claim.token)
      }
      const pending = await store.claim("pending")
      if (pending.status !== "acquired") throw new Error("Unexpected claim")
      const live = await store.claim("live")
      if (live.status !== "acquired") throw new Error("Unexpected claim")
      vi.advanceTimersByTime(50)
      await store.complete("live", live.token)
      vi.advanceTimersByTime(50)
      for (let i = 0; i < 298; i++) {
        const claim = await store.claim(`new-${i}`)
        if (claim.status !== "acquired") throw new Error("Expired capacity was not freed")
        await store.complete(`new-${i}`, claim.token)
      }
      expect((await store.claim("live")).status).toBe("completed")
      expect((await store.claim("pending")).status).toBe("pending")
      await expect(store.claim("over-capacity")).rejects.toMatchObject({ status: 503 })
      vi.advanceTimersByTime(50)
      expect((await store.claim("live")).status).toBe("acquired")
      expect((await store.claim("pending")).status).toBe("pending")
    } finally { vi.useRealTimers() }
  })

  it("does not expire running handlers and ignores stale release tokens", async () => {
    const store = createMemoryIdempotencyStore({ maxEntries: 1, retentionMs: 1 })
    const claim = await store.claim("one")
    if (claim.status !== "acquired") throw new Error("Unexpected claim")
    await store.release("one", "wrong-token")
    expect((await store.claim("one")).status).toBe("pending")
    await store.release("one", claim.token)
    expect((await store.claim("one")).status).toBe("acquired")
    await store.release("one", claim.token)
    expect((await store.claim("one")).status).toBe("pending")
  })
})
