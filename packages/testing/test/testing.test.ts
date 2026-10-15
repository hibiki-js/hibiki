import { describe, expect, it, vi } from "vitest"
import { defineProvider, Hibiki, type ParseResult } from "@hibiki-js/core"
import { createWebhookTest, githubRequest, stripeRequest } from "../src/index.js"
import { stripe } from "@hibiki-js/stripe"
import { github } from "@hibiki-js/github"

interface Events { ping: { ok: true } }
const example = defineProvider<"example", Events>({
  name: "example",
  async verify() {},
  async parse(): Promise<ParseResult<Events>> {
    return { kind: "supported", eventName: "ping", event: { ok: true } }
  },
})

describe("testing helpers", () => {
  it("preserves fixed HMAC-SHA256 signatures for Unicode JSON bodies", async () => {
    const payload = { text: "日本語😀\u0000" }
    const github = await githubRequest(payload, "push", "secret")
    const stripe = await stripeRequest(payload, "secret", 1_700_000_000)
    // Independent fixed vectors, including zeroes and both hex digits of each byte.
    expect(github.headers.get("x-hub-signature-256")).toBe("sha256=3d6e6ff787c38649699566d1e1d628175f2fa26103388b56993bd458c6cc13ec")
    expect(stripe.headers.get("stripe-signature")).toBe("t=1700000000,v1=fd8eaf849ee516f29584a82f083d24e7ca180aec03774237dcfa45da64eb1b4d")
    expect(await github.text()).toBe(JSON.stringify(payload))
    expect(await stripe.text()).toBe(JSON.stringify(payload))
  })

  it("builds signed stripe and github requests", async () => {
    const stripe = await stripeRequest({ type: "invoice.paid" }, "secret", 1_700_000_000)
    expect(stripe.headers.get("stripe-signature")).toContain("t=1700000000")

    const github = await githubRequest({ ref: "main" }, "push", "secret")
    expect(github.headers.get("x-github-event")).toBe("push")
    expect(github.headers.get("x-hub-signature-256")).toMatch(/^sha256=/)
  })

  it("emitEvent rejects missing secrets and unsupported providers", async () => {
    const app = new Hibiki().use(example)
    const webhook = createWebhookTest(app)
    await expect(webhook.emitEvent("example.ping" as never, {})).rejects.toThrow(/Missing secret/)

    const withSecret = createWebhookTest(app, { secrets: { example: "secret" } })
    await expect(withSecret.emitEvent("example.ping" as never, {})).rejects.toThrow(/No signed-request helper/)
    await expect(withSecret.emitEvent("bad" as never, {})).rejects.toThrow(/Invalid event name/)
  })

  it("emit forwards raw requests", async () => {
    const app = new Hibiki().use(example)
    app.on("example.ping", () => new Response("pong"))
    const webhook = createWebhookTest(app)
    const response = await webhook.emit(new Request("https://test", { method: "POST", body: "{}" }), "example")
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("pong")
  })

  it("checks typed payloads and verifies the intended side effects", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret" })).use(github({ secret: "github-secret" }))
    const seen: string[] = []
    app.on("stripe.checkout.session.completed", ({ event }) => {
      if (event.data.object.payment_status === "paid") seen.push(event.data.object.id)
    })
    app.on("github.issues.opened", ({ event }) => { seen.push(event.issue.title ?? "untitled") })
    const webhook = createWebhookTest(app, { secrets: { stripe: "secret", github: "github-secret" } })
    expect((await webhook.emitTypedEvent("stripe.checkout.session.completed", {
      id: "evt_1", type: "checkout.session.completed",
      data: { object: { id: "cs_1", object: "checkout.session", payment_status: "paid", amount_total: 1200 } },
    })).status).toBe(204)
    expect((await webhook.emitTypedEvent("github.issues.opened", {
      action: "opened", issue: { number: 1, title: "Fix billing" }, repository: { full_name: "acme/app" },
    })).status).toBe(204)
    expect(seen).toEqual(["cs_1", "Fix billing"])
    // These checks must compile without executing deliberately invalid fixtures.
    if (false) {
      // @ts-expect-error a different event envelope cannot widen the selected event name
      webhook.emitTypedEvent("stripe.checkout.session.completed", { id: "evt", type: "invoice.paid", data: { object: { id: "in", object: "invoice" } } })
      // @ts-expect-error the checkout amount is numeric
      webhook.emitTypedEvent("stripe.checkout.session.completed", { id: "evt", type: "checkout.session.completed", data: { object: { id: "cs", object: "checkout.session", amount_total: "1200" } } })
      // @ts-expect-error action and event name must agree
      webhook.emitTypedEvent("github.issues.opened", { action: "closed", issue: { number: 1 }, repository: { full_name: "a/b" } })
      // @ts-expect-error a complete payload includes the repository
      webhook.emitTypedEvent("github.push", { ref: "main" })
    }
    await expect(webhook.emitTypedEvent("stripe.checkout.session.completed", { type: "invoice.paid" } as never)).rejects.toThrow(/Payload type/)
    await expect(webhook.emitTypedEvent("github.issues.opened", { action: "closed" } as never)).rejects.toThrow(/Payload action/)
  })

  it("can exercise wrong secrets, expiry, and body tampering without calling handlers", async () => {
    const app = new Hibiki().use(stripe({ secret: "secret" }))
    let calls = 0
    app.on("stripe.invoice.paid", () => { calls++ })
    const webhook = createWebhookTest(app, { secrets: { stripe: "secret" } })
    for (const options of [{ secret: "wrong" }, { timestamp: Math.floor(Date.now() / 1000) - 301 }]) {
      const response = await webhook.emitEvent("stripe.invoice.paid", { id: "in_1", object: "invoice" }, options)
      expect(response.status).toBe(400)
      expect(await response.text()).toBe("HIBIKI_VERIFICATION_FAILED")
    }
    const valid = await webhook.requestEvent("stripe.invoice.paid", { id: "in_1", object: "invoice" })
    const tampered = new Request(valid.url, { method: "POST", headers: valid.headers, body: (await valid.text()).replace("in_1", "in_2") })
    expect((await webhook.emit(tampered, "stripe")).status).toBe(400)
    expect(calls).toBe(0)
    expect((await webhook.emitEvent("stripe.invoice.paid", { id: "in_1", object: "invoice" })).status).toBe(204)
    expect(calls).toBe(1)
  })

  it("does not silently ignore Stripe-only request options on GitHub", async () => {
    const app = new Hibiki().use(github({ secret: "secret" }))
    await expect(createWebhookTest(app, { secrets: { github: "secret" } }).requestEvent("github.push", {}, { timestamp: 1 })).rejects.toThrow(/only for Stripe/)
  })
})


describe("harness signing keys", () => {
  const payload = { ref: "refs/heads/main", repository: { full_name: "hibiki/repo" } }
  const invoice = { id: "in_test", object: "invoice" }
  function app() { return new Hibiki().use(stripe({ secret: "secret" })).use(github({ secret: "secret" })) }

  it("shares pending imports per provider for concurrent default requests", async () => {
    const webhook = createWebhookTest(app(), { secrets: { stripe: "secret", github: "secret" } })
    const imports = vi.spyOn(crypto.subtle, "importKey")
    try {
      const requests = await Promise.all(Array.from({ length: 8 }, () => Promise.all([
        webhook.requestEvent("stripe.invoice.paid", invoice), webhook.requestEvent("github.push", payload),
      ])))
      expect(imports).toHaveBeenCalledTimes(2)
      expect(new Set(await Promise.all(requests.map(async ([request]) => (await request.json() as { id: string }).id))).size).toBe(8)
    } finally { imports.mockRestore() }
  })

  it("keeps caches local to each harness", async () => {
    const application = app()
    const a = createWebhookTest(application, { secrets: { github: "secret" } })
    const b = createWebhookTest(application, { secrets: { github: "secret" } })
    const imports = vi.spyOn(crypto.subtle, "importKey")
    try {
      await a.requestEvent("github.push", payload)
      await b.requestEvent("github.push", payload)
      expect(imports).toHaveBeenCalledTimes(2)
    } finally { imports.mockRestore() }
  })

  it("does not cache overrides or replace a default key with them", async () => {
    const application = app()
    let calls = 0
    application.on("stripe.invoice.paid", () => { calls++ })
    const webhook = createWebhookTest(application, { secrets: { stripe: "secret" } })
    const imports = vi.spyOn(crypto.subtle, "importKey")
    try {
      expect((await webhook.emitEvent("stripe.invoice.paid", invoice)).status).toBe(204)
      for (let i = 0; i < 2; i++) expect((await webhook.emitEvent("stripe.invoice.paid", invoice, { secret: "wrong" })).status).toBe(400)
      expect((await webhook.emitEvent("stripe.invoice.paid", invoice)).status).toBe(204)
      expect(imports).toHaveBeenCalledTimes(3)
      expect(calls).toBe(2)
    } finally { imports.mockRestore() }
  })

  it("rejects GitHub secret overrides without caching them or replacing the default key", async () => {
    const application = app()
    const seen: string[] = []
    application.on("github.push", ({ event }) => { seen.push(event.ref) })
    const webhook = createWebhookTest(application, { secrets: { github: "secret" } })
    const imports = vi.spyOn(crypto.subtle, "importKey")
    try {
      expect((await webhook.emitEvent("github.push", payload)).status).toBe(204)
      for (let i = 0; i < 2; i++) {
        const response = await webhook.emitEvent("github.push", { ...payload, ref: `refs/heads/rejected-${i}` }, { secret: "wrong" })
        expect(response.status).toBe(400)
        expect(await response.text()).toBe("HIBIKI_VERIFICATION_FAILED")
        expect(seen).toEqual([payload.ref])
      }
      const next = { ...payload, ref: "refs/heads/next" }
      expect((await webhook.emitEvent("github.push", next)).status).toBe(204)
      expect(seen).toEqual([payload.ref, next.ref])
      expect(imports).toHaveBeenCalledTimes(3)
    } finally { imports.mockRestore() }
  })

  it("uses changed default secrets without retaining earlier configurations", async () => {
    const secrets = { github: "secret" }
    const webhook = createWebhookTest(app(), { secrets })
    const imports = vi.spyOn(crypto.subtle, "importKey")
    try {
      await webhook.requestEvent("github.push", payload)
      secrets.github = "new-secret"
      const changed = await webhook.requestEvent("github.push", payload)
      await webhook.requestEvent("github.push", payload)
      secrets.github = "secret"
      await webhook.requestEvent("github.push", payload)
      expect(imports).toHaveBeenCalledTimes(3)
      const expected = await githubRequest(payload, "push", "new-secret")
      expect(changed.headers.get("x-hub-signature-256")).toBe(expected.headers.get("x-hub-signature-256"))
    } finally { imports.mockRestore() }
  })

  it("retries a failed import", async () => {
    const webhook = createWebhookTest(app(), { secrets: { github: "secret" } })
    const error = new Error("temporary import failure")
    const imports = vi.spyOn(crypto.subtle, "importKey").mockRejectedValueOnce(error)
    try {
      await expect(webhook.requestEvent("github.push", payload)).rejects.toBe(error)
      await webhook.requestEvent("github.push", payload)
      await webhook.requestEvent("github.push", payload)
      expect(imports).toHaveBeenCalledTimes(2)
    } finally { imports.mockRestore() }
  })

  it("does not evict a newer configuration when an older pending import fails", async () => {
    const secrets = { github: "secret" }
    const webhook = createWebhookTest(app(), { secrets })
    let reject!: (error: Error) => void
    const pending = new Promise<CryptoKey>((_resolve, fail) => { reject = fail })
    const imports = vi.spyOn(crypto.subtle, "importKey").mockImplementationOnce(() => pending)
    try {
      const first = webhook.requestEvent("github.push", payload).catch(error => error)
      secrets.github = "new-secret"
      await webhook.requestEvent("github.push", payload)
      const error = new Error("old import failed")
      reject(error)
      expect(await first).toBe(error)
      await webhook.requestEvent("github.push", payload)
      expect(imports).toHaveBeenCalledTimes(2)
    } finally { imports.mockRestore() }
  })

  it("keeps standalone request helpers uncached", async () => {
    const imports = vi.spyOn(crypto.subtle, "importKey")
    try {
      await githubRequest(payload, "push", "secret")
      await githubRequest(payload, "push", "secret")
      await stripeRequest(invoice, "secret")
      await stripeRequest(invoice, "secret")
      expect(imports).toHaveBeenCalledTimes(4)
    } finally { imports.mockRestore() }
  })
})


describe("standalone helper errors", () => {
  it("returns rejected promises when payload serialization fails", async () => {
    const payload: { circular?: unknown } = {}
    payload.circular = payload
    await expect(stripeRequest(payload, "secret")).rejects.toThrow(TypeError)
    await expect(githubRequest(payload, "push", "secret")).rejects.toThrow(TypeError)
  })
})
