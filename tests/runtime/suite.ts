import { defineProvider, Hibiki } from "@hibiki-js/core"
import { stripe } from "@hibiki-js/stripe"
import { github } from "@hibiki-js/github"
import { discord } from "@hibiki-js/discord"
import { stripeRequest, githubRequest } from "@hibiki-js/testing"

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
      const publicKey = hex(await crypto.subtle.exportKey("raw", pair.publicKey))
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
  cases.push({
    name: `${provider.name}: accepts signed event and executes handler`,
    async run() {
      const fixture = await provider.create()
      const response = await fixture.handle(await fixture.request())
      equal(response.status, 200, "Success status")
      equal(await response.text(), fixture.successBody, "Handler response")
      equal(fixture.calls(), 1, "Verified handler calls")
    },
  })
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
