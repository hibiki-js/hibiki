import { describe, expect, it } from "vitest"
import { defineProvider, Hibiki, HibikiError, type ParseResult } from "../src/index.js"

interface Events { ping: { value: string } }
const provider = defineProvider<"example", Events>({
  name: "example",
  async verify() {},
  async parse({ text }): Promise<ParseResult<Events>> {
    if (text === "unsupported") return { kind: "unsupported", nativeEventName: "other" }
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

  it("distinguishes unhandled supported and unsupported events", async () => {
    const app = new Hibiki({ strictEvents: true }).use(provider)
    expect((await app.handle(new Request("https://test", { method: "POST", body: "hello" }), { provider: "example" })).status).toBe(204)
    const response = await app.handle(new Request("https://test", { method: "POST", body: "unsupported" }), { provider: "example" })
    expect(response.status).toBe(400)
    expect(await response.text()).toBe("HIBIKI_UNSUPPORTED_EVENT")
  })

  it("rejects duplicate handlers", () => {
    const app = new Hibiki().use(provider)
    app.on("example.ping", () => {})
    expect(() => app.on("example.ping", () => {})).toThrowError(HibikiError)
  })
})
