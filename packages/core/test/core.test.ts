import { describe, expect, expectTypeOf, it } from "vitest"
import { defineProvider, Hibiki, HibikiError, type ParseResult } from "../src/index.js"

interface Events { ping: { value: string } }
const provider = defineProvider<"example", Events>({
  name: "example",
  async verify() {},
  async parse({ text }): Promise<ParseResult<Events>> {
    if (text === "unsupported") return { kind: "unsupported", nativeEventName: "other" }
    if (text === "bad-json") throw new Error("boom")
    return { kind: "supported", eventName: "ping", event: { value: text } }
  },
})

describe("Hibiki", () => {
  it("is an immutable provider builder and preserves the handler request body", async () => {
    const base = new Hibiki()
    const app = base.use(provider)
    expect(app).not.toBe(base)
    let body = ""
    app.on("example.ping", async (context) => { body = await context.request.text(); expect(context.event.value).toBe("hello") })
    const response = await app.handle(new Request("https://test", { method: "POST", body: "hello" }), { provider: "example" })
    expect(response.status).toBe(204)
    expect(body).toBe("hello")
  })

  it("returns 200 for unsupported events unless strictEvents is enabled", async () => {
    const app = new Hibiki().use(provider)
    expect((await app.handle(new Request("https://test", { method: "POST", body: "unsupported" }), { provider: "example" })).status).toBe(200)

    const strict = new Hibiki({ strictEvents: true }).use(provider)
    expect((await strict.handle(new Request("https://test", { method: "POST", body: "hello" }), { provider: "example" })).status).toBe(204)
    const response = await strict.handle(new Request("https://test", { method: "POST", body: "unsupported" }), { provider: "example" })
    expect(response.status).toBe(400)
    expect(await response.text()).toBe("HIBIKI_UNSUPPORTED_EVENT")
  })

  it("runs middleware around handlers and preserves custom responses", async () => {
    const order: string[] = []
    const app = new Hibiki().use(provider)
    app.useMiddleware(async (_context, next) => { order.push("before"); await next(); order.push("after") })
    app.on("example.ping", () => { order.push("handler"); return new Response("ok", { status: 201 }) })
    const response = await app.handle(new Request("https://test", { method: "POST", body: "hello" }), { provider: "example" })
    expect(order).toEqual(["before", "handler", "after"])
    expect(response.status).toBe(201)
    expect(await response.text()).toBe("ok")
  })

  it("maps handler and parse failures to stable error codes", async () => {
    const failing = new Hibiki().use(provider)
    failing.on("example.ping", () => { throw new Error("handler") })
    expect(await (await failing.handle(new Request("https://test", { method: "POST", body: "hello" }), { provider: "example" })).text()).toBe("HIBIKI_HANDLER_FAILED")

    const app = new Hibiki().use(provider)
    expect(await (await app.handle(new Request("https://test", { method: "POST", body: "bad-json" }), { provider: "example" })).text()).toBe("HIBIKI_PARSE_FAILED")
  })

  it("rejects duplicate handlers", () => {
    const app = new Hibiki().use(provider)
    app.on("example.ping", () => {})
    expect(() => app.on("example.ping", () => {})).toThrowError(HibikiError)
  })

  it("narrows handler context types from registered events", () => {
    const app = new Hibiki().use(provider)
    app.on("example.ping", (context) => {
      expectTypeOf(context.event.value).toEqualTypeOf<string>()
      expectTypeOf(context.provider).toEqualTypeOf<"example">()
    })
  })
})
