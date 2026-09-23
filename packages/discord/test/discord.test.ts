import { describe, expect, expectTypeOf, it } from "vitest"
import { Hibiki } from "@hibiki-js/core"
import { discord } from "../src/index.js"

const encoder = new TextEncoder()
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")

async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])
  return {
    privateKey: pair.privateKey,
    publicKey: hex(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
  }
}

async function request(payload: unknown, privateKey: CryptoKey, timestamp = "1700000000") {
  const body = JSON.stringify(payload)
  const signed = encoder.encode(timestamp + body)
  const signature = hex(new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, signed as BufferSource)))
  return new Request("https://hibiki.test/webhook", { method: "POST", headers: {
    "content-type": "application/json", "x-signature-ed25519": signature, "x-signature-timestamp": timestamp,
  }, body })
}

describe("Discord provider", () => {
  it("verifies and routes interaction types", async () => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey }))
    let name = ""
    app.on("discord.application_command", ({ event }) => {
      expectTypeOf(event.type).toEqualTypeOf<2>()
      name = event.data?.name as string
    })
    const response = await app.handle(await request({ id: "1", application_id: "app", type: 2, data: { name: "hello" } }, keys.privateKey), { provider: "discord" })
    expect(response.status).toBe(204)
    expect(name).toBe("hello")
  })

  it("lets a ping handler return Discord's PONG response", async () => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey }))
    app.on("discord.ping", () => Response.json({ type: 1 }))
    const response = await app.handle(await request({ id: "1", application_id: "app", type: 1 }, keys.privateKey), { provider: "discord" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ type: 1 })
  })

  it("rejects missing, malformed, and invalid signatures", async () => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey }))
    const missing = new Request("https://hibiki.test/webhook", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
    expect((await app.handle(missing, { provider: "discord" })).status).toBe(401)
    const malformed = new Request("https://hibiki.test/webhook", { method: "POST", headers: { "content-type": "application/json", "x-signature-ed25519": "abc", "x-signature-timestamp": "1" }, body: "{}" })
    expect((await app.handle(malformed, { provider: "discord" })).status).toBe(401)
    const invalid = await request({ id: "1", application_id: "app", type: 3 }, keys.privateKey)
    const modified = new Request(invalid.url, { method: "POST", headers: invalid.headers, body: JSON.stringify({ id: "1", application_id: "app", type: 2 }) })
    expect((await app.handle(modified, { provider: "discord" })).status).toBe(401)
  })

  it("rejects non-JSON content after signature verification and ignores unknown types", async () => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey }))
    const valid = await request({ id: "1", application_id: "app", type: 2 }, keys.privateKey)
    const form = new Request(valid.url, { method: "POST", headers: new Headers([...valid.headers, ["content-type", "text/plain"]]), body: await valid.text() })
    expect((await app.handle(form, { provider: "discord" })).status).toBe(415)
    expect((await app.handle(await request({ id: "1", application_id: "app", type: 99 }, keys.privateKey), { provider: "discord" })).status).toBe(200)
  })

  it("validates the configured public key", () => {
    expect(() => discord({ publicKey: "not-a-key" })).toThrow("publicKey")
  })
})
