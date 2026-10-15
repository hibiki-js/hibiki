import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { cpus } from "node:os"
import { Hibiki } from "../packages/core/dist/index.js"
import { environment, assertEnvironmentUnchanged } from "./environment.mjs"
import { parseArgs } from "node:util"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
const { values } = parseArgs({
  options: { baseline: { type: "string" }, output: { type: "string" } },
})
const measuredEnvironment = await environment()
assert.ok(
  values.baseline,
  "Pass --baseline PATH to a separately built checkout",
)
const modules = {},
  hashes = {}
for (const [variant, root] of [
  ["baseline", values.baseline],
  ["candidate", process.cwd()],
])
  for (const name of ["testing", "github", "stripe"]) {
    const file = resolve(root, "packages", name, "dist/index.js"),
      key = name + "-" + variant
    modules[key] = await import(pathToFileURL(file).href)
    hashes[key] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex")
  }
const results = [],
  encoder = new TextEncoder(),
  secret = "benchmark-only-secret"
const cases = []
for (const provider of ["github", "stripe"])
  for (const bytes of [1024, 102400])
    for (const op of [
      "request",
      "send",
      "send-and-handle",
      ...(provider === "github" ? ["parse", "handle"] : []),
    ])
      cases.push({ provider, bytes, op })
cases.push({ provider: "github", bytes: 102400, op: "emit", unicode: true })
for (const c of cases) {
  const samples = [[], []],
    calls = [0, 0],
    apps = [],
    providers = [],
    senders = [],
    capture = []
  for (let v = 0; v < 2; v++) {
    const module = modules[c.provider + "-" + (v ? "candidate" : "baseline")]
    providers[v] = module[c.provider]({ secret })
    apps[v] = new Hibiki().use(providers[v])
    apps[v].on(
      c.provider === "github" ? "github.push" : "stripe.invoice.paid",
      () => {
        calls[v]++
      },
    )
    senders[v] = module[
      c.provider === "github" ? "createGitHubWebhook" : "createStripeWebhook"
    ]("https://hibiki.test/webhook", {
      secret,
      fetch: async (url, init) => {
        if (c.op === "send-and-handle")
          return apps[v].handle(new Request(url, init), {
            provider: c.provider,
          })
        capture[v] = init
        return new Response(null, { status: 204 })
      },
    })
  }
  for (let i = 0; i < 1500; i++) {
    const id = String(i).padStart(12, "0")
    const payload =
      c.provider === "github"
        ? {
            ref: "refs/heads/" + id,
            repository: { full_name: "hibiki/repo" },
            padding: "",
          }
        : {
            id,
            type: "invoice.paid",
            data: { object: { id: "in_test", object: "invoice" } },
            padding: "",
          }
    const padding = c.bytes - encoder.encode(JSON.stringify(payload)).length
    payload.padding = c.unicode
      ? "あ".repeat(Math.floor(padding / 3)) + "x".repeat(padding % 3)
      : "x".repeat(padding)
    const body = JSON.stringify(payload),
      rawBody = encoder.encode(body),
      timestamp = Math.floor(Date.now() / 1000),
      outputs = []
    assert.equal(rawBody.length, c.bytes)
    for (const v of i % 2 ? [1, 0] : [0, 1]) {
      const testing = modules["testing-" + (v ? "candidate" : "baseline")]
      let input
      if (c.op === "handle")
        input = await modules["testing-baseline"].githubRequest(
          payload,
          "push",
          secret,
        )
      if (c.op === "parse") {
        const request = new Request("https://hibiki.test/webhook", {
          method: "POST",
          headers: { "x-github-event": "push", "content-type": "application/json" },
          body,
        })
        input = { rawBody, text: body, headers: request.headers, request }
      }
      const start = performance.now()
      let result
      if (c.op === "parse")
        result = await providers[v].parse(input)
      else if (c.op === "handle")
        result = await apps[v].handle(input, { provider: "github" })
      else if (c.op.startsWith("send"))
        result =
          c.provider === "github"
            ? await senders[v].send("push", payload)
            : await senders[v].send(payload, { timestamp })
      else {
        result =
          c.provider === "github"
            ? await testing.githubRequest(payload, "push", secret)
            : await testing.stripeRequest(payload, secret, timestamp)
        if (c.op === "emit")
          result = await apps[v].handle(result, { provider: c.provider })
      }
      const elapsed = performance.now() - start
      if (i >= 500) samples[v].push(elapsed)
      if (c.op === "parse") outputs[v] = result
      else if (c.op === "request")
        outputs[v] = {
          body: await result.text(),
          signature: result.headers.get(
            c.provider === "github"
              ? "x-hub-signature-256"
              : "stripe-signature",
          ),
        }
      else if (c.op === "send")
        outputs[v] = { body: capture[v].body, headers: capture[v].headers }
      else assert.equal(result.status, 204)
    }
    if (["parse", "request", "send"].includes(c.op))
      assert.deepEqual(outputs[0], outputs[1])
    if (c.op === "request") assert.equal(outputs[0].body, body)
  }
  if (["handle", "emit", "send-and-handle"].includes(c.op))
    assert.deepEqual(calls, [1500, 1500])
  const stats = samples.map((s) => {
    s.sort((a, b) => a - b)
    return {
      p50Us: s[499] * 1000,
      p95Us: s[949] * 1000,
      meanUs: (s.reduce((a, b) => a + b) * 1000) / s.length,
    }
  })
  const result = { ...c, baseline: stats[0], candidate: stats[1] }
  results.push(result)
  console.log(JSON.stringify(result))
}
await assertEnvironmentUnchanged(measuredEnvironment)
if (values.output)
  await writeFile(
    values.output,
    JSON.stringify(
      {
        ...measuredEnvironment,
        runtime: process.version,
        cpu: cpus()[0]?.model,
        warmup: 500,
        iterations: 1000,
        concurrency: 1,
        hashes,
        results,
      },
      null,
      2,
    ) + "\n",
  )
