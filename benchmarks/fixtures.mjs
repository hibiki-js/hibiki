import assert from "node:assert/strict"
import { Hibiki } from "../packages/core/dist/index.js"
import { stripe } from "../packages/stripe/dist/index.js"
import { github } from "../packages/github/dist/index.js"
import { discord } from "../packages/discord/dist/index.js"

const encoder = new TextEncoder()
const hex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("")
const secret = "benchmark-only-secret"

// Signing, key generation, app setup and Request construction are outside timing.
export async function createFixture(name, bytes, count) {
  const hmac = name === "discord" ? undefined : await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const pair = name === "discord" ? await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]) : undefined
  const provider = name === "stripe" ? stripe({ secret }) : name === "github" ? github({ secret }) : discord({ publicKey: hex(await crypto.subtle.exportKey("raw", pair.publicKey)) })
  const app = new Hibiki().use(provider)
  let calls = 0
  const event = name === "stripe" ? "invoice.paid" : name === "github" ? "issues.opened" : "application_command"
  app.on(`${name}.${event}`, () => { calls++; return new Response(null, { status: 204 }) })
  async function prepare(index) {
    // Fresh, fixed-length signed IDs prevent the deduplication fast path from
    // masquerading as full webhook dispatch. Keep each JSON body exactly sized.
    const id = String(index).padStart(12, "0")
    const payload = name === "stripe" ? { id, type: event, data: { object: { id: "in_bench", object: "invoice" } }, padding: "" }
      : name === "github" ? { action: "opened", issue: { id: index, number: 1, title: "Benchmark" }, repository: { full_name: "hibiki/bench" }, padding: "" }
      : { id, application_id: "bench", type: 2, data: { name: "bench" }, padding: "" }
    payload.padding = "x".repeat(bytes - encoder.encode(JSON.stringify(payload)).byteLength)
    const body = JSON.stringify(payload)
    const rawBody = encoder.encode(body)
    assert.equal(rawBody.byteLength, bytes)
    const timestamp = String(Math.floor(Date.now() / 1000))
    const headers = new Headers({ "content-type": "application/json" })
    if (name === "stripe") {
      headers.set("stripe-signature", `t=${timestamp},v1=${hex(await crypto.subtle.sign("HMAC", hmac, encoder.encode(`${timestamp}.${body}`)))}`)
    } else if (name === "github") {
      headers.set("x-github-event", "issues")
      headers.set("x-hub-signature-256", `sha256=${hex(await crypto.subtle.sign("HMAC", hmac, rawBody))}`)
    } else {
      headers.set("x-signature-timestamp", timestamp)
      headers.set("x-signature-ed25519", hex(await crypto.subtle.sign("Ed25519", pair.privateKey, encoder.encode(timestamp + body))))
    }
    const request = new Request("https://hibiki.test/benchmark", { method: "POST", body, headers })
    return { rawBody, headers, request }
  }
  return {
    prepare,
    async verify(input) { await provider.verify(input) },
    async handle(input) {
      const response = await app.handle(input.request, { provider: name })
      assert.equal(response.status, 204)
    },
    assertDispatched() { assert.equal(calls, count, "Every measured webhook must execute its handler") },
  }
}
