import { describe, expect, expectTypeOf, it } from "vitest"
import { Hibiki } from "@hibiki-js/core"
import { createDiscordWebhook, discord } from "../src/index.js"

const encoder = new TextEncoder()
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")

/** Generate an ephemeral Ed25519 key pair for Discord signature tests. */
async function keyPair() {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])
  return {
    privateKey: pair.privateKey,
    publicKey: hex(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
  }
}

/** Create a Discord-compatible signed JSON interaction request. */
async function request(payload: unknown, privateKey: CryptoKey, timestamp = String(Math.floor(Date.now() / 1000))) {
  const body = JSON.stringify(payload)
  const signed = encoder.encode(timestamp + body)
  const signature = hex(new Uint8Array(await crypto.subtle.sign("Ed25519", privateKey, signed as BufferSource)))
  return new Request("https://hibiki.test/webhook", { method: "POST", headers: {
    "content-type": "application/json", "x-signature-ed25519": signature, "x-signature-timestamp": timestamp,
  }, body })
}

describe("Discord provider", () => {
  it("sends JSON messages to an incoming webhook and parses the created message", async () => {
    let requestUrl: URL | undefined
    let requestBody = ""
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token?thread_id=default", {
      fetch: async (input, init) => {
        requestUrl = new URL(input.toString())
        requestBody = String(init?.body)
        return Response.json({ id: "456", channel_id: "789", content: "sent" })
      },
    })

    const message = await webhook.send({ content: "hello", embeds: [{ title: "Deploy" }] }, { threadId: "thread", wait: false })
    expect(requestUrl?.searchParams.get("wait")).toBe("false")
    expect(requestUrl?.searchParams.get("thread_id")).toBe("thread")
    expect(JSON.parse(requestBody)).toEqual({ content: "hello", embeds: [{ title: "Deploy" }] })
    expect(message).toEqual({ id: "456", channel_id: "789", content: "sent" })
  })

  it("uses wait=true by default, preserves URL thread IDs, and accepts 204 responses", async () => {
    let requestUrl: URL | undefined
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token?thread_id=default", {
      fetch: async input => {
        requestUrl = new URL(input.toString())
        return new Response(null, { status: 204 })
      },
    })

    expect(await webhook.send({ content: "hello" })).toBeUndefined()
    expect(requestUrl?.searchParams.get("wait")).toBe("true")
    expect(requestUrl?.searchParams.get("thread_id")).toBe("default")
  })

  it("reports Discord webhook error messages and handles non-JSON errors", async () => {
    const jsonError = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async () => Response.json({ message: "Unknown Webhook" }, { status: 404 }),
    })
    await expect(jsonError.send({ content: "hello" })).rejects.toThrow("Discord webhook request failed (404): Unknown Webhook")

    const textError = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async () => new Response("unavailable", { status: 502 }),
    })
    await expect(textError.send({ content: "hello" })).rejects.toThrow("Discord webhook request failed (502)")
  })

  it("verifies and routes interaction types", async () => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey }))
    let name = ""
    app.on("discord.application_command", ({ event }) => {
      expectTypeOf(event.type).toEqualTypeOf<2>()
      name = event.data?.name as string
      return Response.json({ type: 4, data: { content: "hello" } })
    })
    const response = await app.handle(await request({ id: "1", application_id: "app", type: 2, data: { name: "hello" } }, keys.privateKey), { provider: "discord" })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ type: 4, data: { content: "hello" } })
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

  it("rejects expired and replayed interactions", async () => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey, tolerance: 60 }))
    const payload = { id: "1", application_id: "app", type: 2 }
    const stale = await request(payload, keys.privateKey, String(Math.floor(Date.now() / 1000) - 61))
    expect((await app.handle(stale, { provider: "discord" })).status).toBe(401)
    const first = await request(payload, keys.privateKey)
    expect((await app.handle(first, { provider: "discord" })).status).toBe(204)
    const replay = await request(payload, keys.privateKey)
    expect((await app.handle(replay, { provider: "discord" })).status).toBe(200)
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
    expect(() => discord({ publicKey: "00".repeat(32), tolerance: -1 })).toThrow("tolerance")
  })
})
