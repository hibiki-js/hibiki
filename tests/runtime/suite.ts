import { defineProvider, Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { github } from "@hibiki-js/github"
import { discord } from "@hibiki-js/discord"
import { createWebhookTest, stripeRequest, githubRequest } from "@hibiki-js/testing"

/** Fail the current compatibility case when values differ. */
function equal(actual: unknown, expected: unknown, message: string): void {
  if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`)
}

const encoder = new TextEncoder()
const hex = (value: ArrayBuffer) => Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, "0")).join("")
const url = "https://hibiki.test/webhook"
const secret = "runtime_test_secret"
const stripePayload = { id: "evt_runtime", type: "invoice.paid", data: { object: { id: "in_runtime", object: "invoice" } } }
const githubPayload = { action: "opened", issue: { number: 42, title: "Runtime test" }, repository: { full_name: "hibiki-js/hibiki" } }
const discordPayload = { id: "interaction_runtime", application_id: "app_runtime", type: 2, data: { name: "hello" } }

type Fixture = {
  request: () => Promise<Request>
  handle: (request: Request) => Promise<Response>
  calls: () => number
  successBody: string
}
type ProviderCase = {
  name: string
  signatureHeader: string
  failureStatus: number
  create: (expired?: boolean) => Promise<Fixture>
}

const providers: ProviderCase[] = [
  {
    name: "Stripe", signatureHeader: "stripe-signature", failureStatus: 400,
    async create(expired = false) {
      let calls = 0
      const app = new Hibiki().use(stripe({ secret }))
      app.on("stripe.invoice.paid", async context => {
        equal(context.event.data.object.id, "in_runtime", "Stripe event")
        equal(context.id, "evt_runtime", "Stripe event ID")
        equal(await context.request.text(), context.rawBody, "Original Stripe body")
        calls++
        return new Response("stripe handled", { status: 200 })
      })
      return {
        request: () => stripeRequest(stripePayload, secret, Math.floor(Date.now() / 1000) - (expired ? 600 : 0)),
        handle: request => app.handle(request, { provider: "stripe" }),
        calls: () => calls, successBody: "stripe handled",
      }
    },
  },
  {
    name: "GitHub", signatureHeader: "x-hub-signature-256", failureStatus: 400,
    async create() {
      let calls = 0
      const app = new Hibiki().use(github({ secret }))
      app.on("github.issues.opened", context => {
        equal(context.event.issue.number, 42, "GitHub issue")
        equal(context.event.action, "opened", "GitHub action")
        calls++
        return new Response("github handled")
      })
      return {
        request: () => githubRequest(githubPayload, "issues", secret),
        handle: request => app.handle(request, { provider: "github" }),
        calls: () => calls, successBody: "github handled",
      }
    },
  },
  {
    name: "Discord", signatureHeader: "x-signature-ed25519", failureStatus: 401,
    async create(expired = false) {
      let calls = 0
      const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])
      const publicKey = hex(await crypto.subtle.exportKey("raw", pair.publicKey)).toUpperCase()
      const app = new Hibiki().use(discord({ publicKey }))
      app.on("discord.application_command", context => {
        equal(context.event.data?.name, "hello", "Discord command")
        equal(context.id, discordPayload.id, "Discord interaction ID")
        calls++
        return Response.json({ type: 4, data: { content: "hello" } })
      })
      return {
        async request() {
          const timestamp = String(Math.floor(Date.now() / 1000) - (expired ? 600 : 0))
          const body = JSON.stringify(discordPayload)
          const signature = hex(await crypto.subtle.sign("Ed25519", pair.privateKey, encoder.encode(timestamp + body)))
          return new Request(url, {
            method: "POST", body,
            headers: { "content-type": "application/json", "x-signature-ed25519": signature, "x-signature-timestamp": timestamp },
          })
        },
        handle: request => app.handle(request, { provider: "discord" }),
        calls: () => calls, successBody: JSON.stringify({ type: 4, data: { content: "hello" } }),
      }
    },
  },
]

const coreProvider = defineProvider<"example", { ping: { value: string } }>({
  name: "example",
  async verify() {},
  async parse({ text }) {
    if (text === "unsupported") return { kind: "unsupported", nativeEventName: "other" }
    const event = JSON.parse(text) as { value: string }
    return { kind: "supported", eventName: "ping", event }
  },
})

type Case = { name: string; run: () => Promise<void> }
const cases: Case[] = [
  {
    name: "Core: bounded expiry cleanup preserves pending IDs and renewed ownership",
    async run() {
      const { createMemoryIdempotencyStore } = await import("@hibiki-js/core")
      const originalNow = Date.now
      let now = originalNow()
      Date.now = () => now
      try {
        const store = createMemoryIdempotencyStore({ retentionMs: 100, maxEntries: 261 })
        const tokens: string[] = []
        for (let i = 0; i < 260; i++) {
          const claim = await store.claim(String(i))
          equal(claim.status, "acquired", "Initial claim")
          if (claim.status !== "acquired") throw new Error("Missing token")
          tokens.push(claim.token)
          await store.complete(String(i), claim.token)
        }
        equal((await store.claim("pending")).status, "acquired", "Running claim")
        now += 100
        const renewed = await store.claim("259")
        equal(renewed.status, "acquired", "Expired ID beyond cleanup batch")
        if (renewed.status !== "acquired") throw new Error("Missing renewed token")
        await store.complete("259", tokens[259]!)
        await store.release("259", tokens[259]!)
        equal((await store.claim("259")).status, "pending", "Stale tokens ignored")
        await store.complete("259", renewed.token)
        equal((await store.claim("259")).status, "completed", "Renewed owner completes")
        equal((await store.claim("pending")).status, "pending", "Running ID never expires")
        now += 100
        equal((await store.claim("259")).status, "acquired", "Queue drains and accepts renewed ID")
        equal((await store.claim("pending")).status, "pending", "Running ID survives cleanup")
      } finally { Date.now = originalNow }
    },
  },
  {
    name: "Testing: concurrent defaults, overrides and changed secrets",
    async run() {
      const app = new Hibiki().use(stripe({ secret })).use(github({ secret }))
      let stripeCalls = 0
      let githubCalls = 0
      app.on("stripe.invoice.paid", () => { stripeCalls++ })
      app.on("github.issues.opened", () => { githubCalls++ })
      const secrets = { stripe: secret, github: secret }
      const webhook = createWebhookTest(app, { secrets })
      const results = await Promise.all(Array.from({ length: 3 }, async (_, index) => Promise.all([
        webhook.emitEvent("stripe.invoice.paid", { id: "in_runtime", object: "invoice" }),
        webhook.emitEvent("github.issues.opened", { ...githubPayload, issue: { ...githubPayload.issue, number: index } }),
      ])))
      for (const pair of results) for (const result of pair) equal(result.status, 204, "Concurrent signed request")
      equal((await webhook.emitEvent("stripe.invoice.paid", {}, { secret: "wrong" })).status, 400, "Override rejected")
      equal((await webhook.emitEvent("stripe.invoice.paid", {})).status, 204, "Default remains valid")
      secrets.stripe = "changed"
      equal((await webhook.emitEvent("stripe.invoice.paid", {})).status, 400, "Changed secret is used")
      secrets.stripe = secret
      equal((await webhook.emitEvent("stripe.invoice.paid", {})).status, 204, "Restored secret is used")
      equal(stripeCalls, 5, "Stripe handler count")
      equal(githubCalls, 3, "GitHub handler count")
    },
  },
  {
    name: "Stripe: malformed signature before a valid rotated signature",
    async run() {
      const app = new Hibiki().use(stripe({ secret }))
      let calls = 0
      app.on("stripe.invoice.paid", () => { calls++ })
      const request = await stripeRequest(stripePayload, secret)
      request.headers.set("stripe-signature", request.headers.get("stripe-signature")!.replace(",v1=", ",v1=zz,v1="))
      equal((await app.handle(request, { provider: "stripe" })).status, 204, "Rotated signature accepted")
      equal(calls, 1, "Rotated signature handler count")
    },
  },
  {
    name: "Discord: overlong signature is rejected",
    async run() {
      const fixture = await providers.find(provider => provider.name === "Discord")!.create()
      const request = await fixture.request()
      request.headers.set("x-signature-ed25519", "0".repeat(8192))
      const response = await fixture.handle(request)
      equal(response.status, 401, "Overlong signature status")
      equal(await response.text(), "HIBIKI_VERIFICATION_FAILED", "Overlong signature code")
      equal(fixture.calls(), 0, "Rejected handler calls")
    },
  },
  {
    name: "GitHub: large signed payload keeps its authenticated ID and deduplicates",
    async run() {
      const payload = { ...githubPayload, padding: "x".repeat(70_000) }
      const body = JSON.stringify(payload)
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))
      const id = `body:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`
      const app = new Hibiki().use(github({ secret }))
      let calls = 0
      app.on("github.issues.opened", context => {
        equal(context.event.issue.number, 42, "Large payload event")
        equal(context.id, id, "Authenticated body ID")
        calls++
      })
      for (let delivery = 0; delivery < 2; delivery++) {
        const response = await app.handle(await githubRequest(payload, "issues", secret), { provider: "github" })
        equal(response.status, 204, "Large payload response")
      }
      equal(calls, 1, "Deduplicated large payload handler calls")
    },
  },
  {
    name: "GitHub: large unsupported payload settles hashing without dispatch",
    async run() {
      const app = new Hibiki().use(github({ secret }))
      let calls = 0
      app.on("github.issues.opened", () => { calls++ })
      const response = await app.handle(await githubRequest({ ...githubPayload, padding: "x".repeat(70_000) }, "unknown", secret), { provider: "github" })
      equal(response.status, 200, "Unsupported large payload response")
      equal(calls, 0, "Unsupported large payload handler calls")
    },
  },
  {
    name: "Core: registration, dispatch and custom Response",
    async run() {
      const base = new Hibiki()
      const app = base.use(coreProvider)
      equal(Object.is(app, base), false, "Immutable provider registration")
      let calls = 0
      const body = JSON.stringify({ value: "hello" })
      app.on("example.ping", async context => {
        equal(context.event.value, "hello", "Core event")
        equal(context.provider, "example", "Provider name")
        equal(context.rawBody, body, "Raw body")
        equal(await context.request.text(), body, "Readable original Request")
        calls++
        return new Response("handled", { status: 201 })
      })
      const response = await app.handle(new Request(url, { method: "POST", body }), { provider: "example" })
      equal(response instanceof Response, true, "Web Standards Response")
      equal(response.status, 201, "Custom status")
      equal(await response.text(), "handled", "Custom response body")
      equal(calls, 1, "Handler calls")
    },
  },
  {
    name: "Core: returns independently readable internal error Responses",
    async run() {
      const app = new Hibiki().use(defineProvider({
        ...coreProvider,
        async verify() { throw new Error("Unexpected provider failure") },
      }))
      const first = await app.handle(new Request(url), { provider: "example" })
      const second = await app.handle(new Request(url), { provider: "example" })
      equal(Object.is(first, second), false, "Independent Responses")
      for (const response of [first, second]) {
        equal(response.status, 500, "Internal error status")
        equal(await response.text(), "Internal webhook error", "Safe internal error body")
      }
    },
  },
  ...["invalid-json", "unsupported"].map(body => ({
    name: `Core: rejects ${body}`,
    async run() {
      let calls = 0
      const app = new Hibiki({ strictEvents: true }).use(coreProvider)
      app.on("example.ping", () => { calls++ })
      const response = await app.handle(new Request(url, { method: "POST", body }), { provider: "example" })
      equal(response.status, 400, "Core rejection status")
      equal(await response.text(), body === "unsupported" ? "HIBIKI_UNSUPPORTED_EVENT" : "HIBIKI_PARSE_FAILED", "Core error code")
      equal(calls, 0, "Rejected handler calls")
    },
  })),
]

for (const provider of providers) {
  for (const mixedCase of [false, true]) {
    cases.push({
      name: `${provider.name}: accepts ${mixedCase ? "mixed-case hex" : "signed event"} and executes handler`,
      async run() {
        const fixture = await provider.create()
        const request = await fixture.request()
        if (mixedCase) {
          const header = request.headers.get(provider.signatureHeader)!
          const offset = header.lastIndexOf("=") + 1
          const signature = header.slice(offset).split("").map((char, index) => index % 2 ? char.toUpperCase() : char.toLowerCase()).join("")
          request.headers.set(provider.signatureHeader, header.slice(0, offset) + signature)
        }
        const response = await fixture.handle(request)
        equal(response.status, 200, "Success status")
        equal(await response.text(), fixture.successBody, "Handler response")
        equal(fixture.calls(), 1, "Verified handler calls")
      },
    })
  }
  const variants = ["invalid signature", "tampered body", "missing signature"]
  if (provider.name !== "GitHub") variants.push("expired timestamp")
  if (provider.name === "GitHub") variants.push("unsupported content type")
  for (const variant of variants) {
    cases.push({
      name: `${provider.name}: rejects ${variant}`,
      async run() {
        const fixture = await provider.create(variant === "expired timestamp")
        const signed = await fixture.request()
        const headers = new Headers(signed.headers)
        let body = await signed.text()
        if (variant === "invalid signature") {
          const signature = headers.get(provider.signatureHeader)!
          // Preserve encoding and length so cryptographic verification must reject it.
          headers.set(provider.signatureHeader, signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0"))
        }
        if (variant === "missing signature") headers.delete(provider.signatureHeader)
        if (variant === "tampered body") body += " "
        if (variant === "unsupported content type") headers.set("content-type", "text/plain")
        const response = await fixture.handle(new Request(url, { method: "POST", headers, body }))
        const contentTypeFailure = variant === "unsupported content type"
        equal(response.status, contentTypeFailure ? 415 : provider.failureStatus, "Rejection status")
        equal(await response.text(), contentTypeFailure ? "HIBIKI_UNSUPPORTED_CONTENT_TYPE" : "HIBIKI_VERIFICATION_FAILED", "Rejection code")
        equal(fixture.calls(), 0, "Rejected handler calls")
      },
    })
  }
}

/** Execute every shared case in the current runtime and report completed cases. */
export async function runSuite() {
  if (cases.length === 0) throw new Error("No runtime compatibility cases registered")
  const names: string[] = []
  for (const test of cases) {
    try {
      await test.run()
    } catch (cause) {
      throw new Error(`FAIL ${test.name}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause })
    }
    names.push(test.name)
    console.log(`PASS ${test.name}`)
  }
  equal(names.length, cases.length, "Completed runtime cases")
  return { passed: names.length, total: cases.length, names }
}
