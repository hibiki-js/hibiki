import { describe, expect, expectTypeOf, it, vi } from "vitest"
import { Hibiki } from "@hibiki-js/core"
import { createDiscordWebhook, discord, DiscordWebhookError, type DiscordWebhookMessage, type DiscordWebhookSendOptions } from "../src/index.js"

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
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token?thread_id=default&with_components=false", {
      fetch: async (input, init) => {
        requestUrl = new URL(input.toString())
        requestBody = String(init?.body)
        expect(init?.redirect).toBe("error")
        return Response.json({ id: "456", channel_id: "789", content: "sent" })
      },
    })

    const message = await webhook.send({ content: "hello", embeds: [{ title: "Deploy" }], components: [{ type: 1 }] }, { threadId: "thread" })
    expect(requestUrl?.searchParams.get("wait")).toBe("true")
    expect(requestUrl?.searchParams.get("thread_id")).toBe("thread")
    expect(requestUrl?.searchParams.get("with_components")).toBe("true")
    expect(JSON.parse(requestBody)).toEqual({ content: "hello", embeds: [{ title: "Deploy" }], components: [{ type: 1 }] })
    expect(message).toEqual({ id: "456", channel_id: "789", content: "sent" })
  })

  it.each([1, 2])("uploads %i files with the message and preserves send options", async count => {
    const files = [
      { filename: "image.png", data: new Blob([new Uint8Array([0, 255, 1])], { type: "image/png" }) },
      { filename: "report.txt", data: new File(["report"], "original.txt", { type: "text/plain" }) },
    ].slice(0, count)
    const payload = {
      content: "Report",
      embeds: [{ image: { url: "attachment://image.png" } }],
      components: [{ type: 1 }],
      attachments: [{ id: 0, filename: "image.png", description: "Preview" }],
    }
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token?thread_id=default", {
      fetch: async (input, init) => {
        const url = new URL(input.toString())
        expect(url.searchParams.get("thread_id")).toBe("thread")
        expect(url.searchParams.get("wait")).toBe(String(count === 1))
        expect(url.searchParams.get("with_components")).toBe("true")
        expect(init?.method).toBe("POST")
        expect(new Headers(init?.headers).has("content-type")).toBe(false)
        expect(init?.body).toBeInstanceOf(FormData)
        const form = init?.body as FormData
        expect([...form.keys()]).toEqual(["payload_json", ...files.map((_, i) => `files[${i}]`)])
        expect(JSON.parse(form.get("payload_json") as string)).toEqual(payload)
        // Exercise runtime boundary generation and multipart decoding as well.
        const request = new Request(input, init)
        expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/)
        const decoded = await request.formData()
        for (const [index, file] of files.entries()) {
          const uploaded = decoded.get(`files[${index}]`) as File
          expect(uploaded.name).toBe(file.filename)
          expect(uploaded.type).toBe(file.data.type)
          expect(await uploaded.arrayBuffer()).toEqual(await file.data.arrayBuffer())
        }
        return count === 1 ? Response.json({ id: "456", channel_id: "789" }) : new Response(null, { status: 204 })
      },
    })
    const message = await webhook.send(payload, { files, threadId: "thread", wait: count === 1 })
    expect(message).toEqual(count === 1 ? { id: "456", channel_id: "789" } : undefined)
    expect(payload.attachments).toEqual([{ id: 0, filename: "image.png", description: "Preview" }])
  })

  it("sends a file-only message and preserves the URL thread and default wait", async () => {
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token?thread_id=default&with_components=true", {
      fetch: async (input, init) => {
        const url = new URL(input.toString())
        expect(url.searchParams.get("thread_id")).toBe("default")
        expect(url.searchParams.get("wait")).toBe("true")
        expect(url.searchParams.has("with_components")).toBe(false)
        expect((init?.body as FormData).get("payload_json")).toBe("{}")
        return Response.json({ id: "456", channel_id: "789" })
      },
    })
    await webhook.send({}, { files: [{ filename: "log.txt", data: new Blob(["log"]) }] })
  })

  it("keeps JSON transport for an empty file list", async () => {
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async (_, init) => {
        expect(new Headers(init?.headers).get("content-type")).toBe("application/json")
        expect(init?.body).toBe('{"content":"hello"}')
        return Response.json({ id: "456", channel_id: "789" })
      },
    })
    await webhook.send({ content: "hello" }, { files: [] })
  })

  it("uses 204 for wait=false, preserves URL thread IDs, and omits with_components without components", async () => {
    let requestUrl: URL | undefined
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token?thread_id=default&with_components=true", {
      fetch: async input => {
        requestUrl = new URL(input.toString())
        return new Response(null, { status: 204 })
      },
    })

    expect(await webhook.send({ content: "hello" }, { wait: false })).toBeUndefined()
    expect(requestUrl?.searchParams.get("wait")).toBe("false")
    expect(requestUrl?.searchParams.get("thread_id")).toBe("default")
    expect(requestUrl?.searchParams.has("with_components")).toBe(false)
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

  it.each([400, 429, 503])("exposes structured HTTP error information for %i", async status => {
    const body = { message: "Request failed", code: 123, retry_after: 1.25 }
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async () => Response.json(body, { status, headers: { "x-request-id": "request-1", "retry-after": "2.5" } }),
    })
    const error = await webhook.send({}).catch(error => error as unknown)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(DiscordWebhookError)
    if (!(error instanceof DiscordWebhookError)) throw new Error("Expected DiscordWebhookError")
    expect(error.name).toBe("DiscordWebhookError")
    expect(error.status).toBe(status)
    expect(error.headers.get("x-request-id")).toBe("request-1")
    expect(error.body).toEqual(body)
    expect(error.retryAfterSeconds).toBe(2.5)
    expect(error.message).toBe(`Discord webhook request failed (${status}): Request failed`)
  })

  it.each(["unavailable", "{invalid JSON", "", "null", "42"])("preserves HTTP error bodies: %j", async text => {
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async () => new Response(text, { status: 502 }),
    })
    const error = await webhook.send({}).catch(error => error as unknown)
    expect(error).toBeInstanceOf(DiscordWebhookError)
    if (!(error instanceof DiscordWebhookError)) throw new Error("Expected DiscordWebhookError")
    expect(error.body).toEqual(text === "null" ? null : text === "42" ? 42 : text)
    expect(error.retryAfterSeconds).toBeUndefined()
  })

  it.each([
    [undefined, 1.25, 1.25], ["0", 3, 0], [" 2.5 ", 3, 2.5],
    ["invalid", 3, 3], ["-1", 3, 3], ["Infinity", 3, 3], ["", 3, 3],
    [undefined, -1, undefined], [undefined, "2", undefined], [undefined, null, undefined],
  ])("reads retry delay from header %j and body %j", async (header, retryAfter, expected) => {
    const error = new DiscordWebhookError(429, new Headers(header === undefined ? {} : { "retry-after": header }), { retry_after: retryAfter })
    expect(error.retryAfterSeconds).toBe(expected)
  })

  it("supports HTTP-date retry headers and rejects invalid retry delays", () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.UTC(2030, 0, 1))
    try {
      const headers = new Headers({ "retry-after": "Tue, 01 Jan 2030 00:01:00 GMT" })
      const error = new DiscordWebhookError(503, headers, {})
      expect(error.retryAfterSeconds).toBe(60)
      headers.set("retry-after", "100")
      expect(error.headers.get("retry-after")).toBe("Tue, 01 Jan 2030 00:01:00 GMT")
      expect(new DiscordWebhookError(429, new Headers({ "retry-after": "Wed, 01 Jan 2020 00:00:00 GMT" }), {}).retryAfterSeconds).toBe(0)
      for (const header of ["Wed, invalid", "9".repeat(400)]) {
        expect(new DiscordWebhookError(429, new Headers({ "retry-after": header }), { retry_after: 4 }).retryAfterSeconds).toBe(4)
      }
      for (const invalid of [Infinity, NaN, -Infinity]) {
        expect(new DiscordWebhookError(429, new Headers(), { retry_after: invalid }).retryAfterSeconds).toBeUndefined()
      }
    } finally {
      clock.mockRestore()
    }
  })

  it.each([false, true])("forwards cancellation for multipart=%j", async multipart => {
    const controller = new AbortController()
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async (_, init) => {
        expect(init?.signal).toBe(controller.signal)
        expect(init?.body instanceof FormData).toBe(multipart)
        init?.signal?.throwIfAborted()
        return Response.json({ id: "456", channel_id: "789" })
      },
    })
    const options = { signal: controller.signal, ...(multipart ? { files: [{ filename: "test.txt", data: new Blob(["test"]) }] } : {}) }
    await expect(webhook.send({}, options)).resolves.toMatchObject({ id: "456" })
    const reason = new DOMException("Cancelled", "AbortError")
    controller.abort(reason)
    await expect(webhook.send({}, options)).rejects.toBe(reason)
  })

  it("preserves in-flight aborts, network errors and response stream errors", async () => {
    const controller = new AbortController()
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: (_, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
      }),
    })
    const pending = webhook.send({}, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toBe(controller.signal.reason)

    const networkError = new TypeError("Connection failed")
    const unavailable = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async () => { throw networkError },
    })
    await expect(unavailable.send({})).rejects.toBe(networkError)

    const streamError = new DOMException("Body read cancelled", "AbortError")
    const brokenBody = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async () => new Response(new ReadableStream({ start(controller) { controller.error(streamError) } }), { status: 429 }),
    })
    await expect(brokenBody.send({})).rejects.toBe(streamError)
  })

  it("narrows return types for wait, including the default and dynamic options", async () => {
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async () => Response.json({ id: "456", channel_id: "789" }),
    })
    const defaultMessage = webhook.send({})
    const waited = webhook.send({}, { wait: true })
    const notWaited = webhook.send({}, { wait: false })
    const options: DiscordWebhookSendOptions = { wait: Boolean(Date.now()) }
    const dynamic = webhook.send({}, options)
    expectTypeOf(defaultMessage).toEqualTypeOf<Promise<DiscordWebhookMessage>>()
    expectTypeOf(waited).toEqualTypeOf<Promise<DiscordWebhookMessage>>()
    expectTypeOf(notWaited).toEqualTypeOf<Promise<undefined>>()
    expectTypeOf(dynamic).toEqualTypeOf<Promise<DiscordWebhookMessage | undefined>>()
    expect(await defaultMessage).toMatchObject({ id: "456" })
    expect(await waited).toMatchObject({ id: "456" })
    expect(await notWaited).toBeUndefined()
    await dynamic
  })

  it.each([true, false])("keeps the sent wait=%j when options change during fetch", async wait => {
    const options: DiscordWebhookSendOptions = { wait }
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async input => {
        expect(new URL(input.toString()).searchParams.get("wait")).toBe(String(wait))
        // A reused options object may be changed while a request is pending.
        await Promise.resolve()
        options.wait = !wait
        return wait ? Response.json({ id: "456", channel_id: "789" }) : new Response(null, { status: 204 })
      },
    })
    expect(await webhook.send({}, options)).toEqual(wait ? { id: "456", channel_id: "789" } : undefined)
  })

  it("rejects an unexpected empty response when waiting for a message", async () => {
    const webhook = createDiscordWebhook("https://discord.com/api/webhooks/123/token", {
      fetch: async () => new Response(null, { status: 204 }),
    })
    await expect(webhook.send({})).rejects.toThrow("Discord webhook returned no message with wait=true")
    await expect(webhook.send({}, { wait: true })).rejects.toThrow("Discord webhook returned no message with wait=true")
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
    app.on("discord.application_command", () => {})
    const payload = { id: "1", application_id: "app", type: 2 }
    const stale = await request(payload, keys.privateKey, String(Math.floor(Date.now() / 1000) - 61))
    expect((await app.handle(stale, { provider: "discord" })).status).toBe(401)
    const first = await request(payload, keys.privateKey)
    expect((await app.handle(first, { provider: "discord" })).status).toBe(204)
    const replay = await request(payload, keys.privateKey)
    expect((await app.handle(replay, { provider: "discord" })).status).toBe(204)
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


describe("Discord retry protection", () => {
  it("allows a signed interaction to retry after a handler failure", async () => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey }))
    let calls = 0
    app.on("discord.application_command", () => { if (++calls === 1) throw new Error("temporary failure") })
    const payload = { id: "retry", application_id: "app", type: 2 }
    expect((await app.handle(await request(payload, keys.privateKey), { provider: "discord" })).status).toBe(500)
    expect((await app.handle(await request(payload, keys.privateKey), { provider: "discord" })).status).toBe(204)
    expect((await app.handle(await request(payload, keys.privateKey), { provider: "discord" })).status).toBe(204)
    expect(calls).toBe(2)
  })

  it("rejects supported interactions without authenticated IDs", async () => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey }))
    expect((await app.handle(await request({ type: 2 }, keys.privateKey), { provider: "discord" })).status).toBe(400)
  })
})

describe("Discord signature length", () => {
  it.each([0, 2, 126, 127, 129, 130, 8192])("rejects a %i-character signature without dispatch", async length => {
    const keys = await keyPair()
    const app = new Hibiki().use(discord({ publicKey: keys.publicKey }))
    let calls = 0
    app.on("discord.application_command", () => { calls++ })
    const response = await app.handle(new Request("https://test", {
      method: "POST",
      headers: { "content-type": "application/json", "x-signature-timestamp": String(Math.floor(Date.now() / 1000)), "x-signature-ed25519": "0".repeat(length) },
      body: "{}",
    }), { provider: "discord" })
    expect(response.status).toBe(401)
    expect(await response.text()).toBe("HIBIKI_VERIFICATION_FAILED")
    expect(calls).toBe(0)
  })
})
