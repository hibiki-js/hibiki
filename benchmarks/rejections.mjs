import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { cpus } from "node:os"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { parseArgs } from "node:util"
import { environment, assertEnvironmentUnchanged } from "./environment.mjs"
const { values } = parseArgs({
  options: { baseline: { type: "string" }, output: { type: "string" } },
})
assert.ok(
  values.baseline,
  "Pass --baseline PATH to a separately built checkout",
)
const measuredEnvironment = await environment()
const roots = [resolve(values.baseline), process.cwd()],
  variants = []
for (const root of roots) {
  const load = (n) =>
    import(pathToFileURL(resolve(root, `packages/${n}/dist/index.js`)).href)
  variants.push({
    core: await load("core"),
    stripe: await load("stripe"),
    github: await load("github"),
    testing: await load("testing"),
    hash: createHash("sha256")
      .update(await readFile(resolve(root, "packages/core/dist/index.js")))
      .digest("hex"),
  })
}
const secret = "secret",
  results = []
for (const scenario of [
  "missing-provider",
  "content-type",
  "parse",
  "strict-event",
  "pending",
  "full-store",
  "complete-failure",
  "invalid-signature",
]) {
  const apps = [],
    calls = [0, 0],
    stores = []
  const isGitHub = scenario === "content-type",
    provider = isGitHub ? "github" : "stripe"
  for (let v = 0; v < 2; v++) {
    const { core, stripe, github } = variants[v]
    const store = core.createMemoryIdempotencyStore({
      maxEntries: scenario === "full-store" ? 1 : 10000,
    })
    stores[v] = store
    if (scenario === "pending")
      await store.claim(JSON.stringify(["stripe", "evt-pending"]))
    if (scenario === "full-store") await store.claim("occupied")
    const idempotencyStore =
      scenario === "complete-failure"
        ? {
            ...store,
            async complete() {
              throw new Error("storage unavailable")
            },
          }
        : store
    const app = new core.Hibiki({ strictEvents: true, idempotencyStore }).use(
      isGitHub ? github.github({ secret }) : stripe.stripe({ secret }),
    )
    app.on(isGitHub ? "github.push" : "stripe.invoice.paid", () => {
      calls[v]++
    })
    apps[v] = app
  }
  const samples = [[], []]
  for (let i = 0; i < 2000; i++)
    for (const v of i % 2 ? [1, 0] : [0, 1]) {
      const payload = isGitHub
        ? { ref: "refs/heads/main", repository: { full_name: "hibiki/repo" } }
        : {
            id: scenario === "pending" ? "evt-pending" : String(i),
            type: scenario === "strict-event" ? "future.event" : "invoice.paid",
            data: { object: { id: "in", object: "invoice" } },
          }
      if (scenario === "parse") delete payload.id
      let req =
        scenario === "missing-provider"
          ? new Request("https://hibiki.test", {
              method: "POST",
              body: "untouched",
            })
          : isGitHub
            ? await variants[v].testing.githubRequest(payload, "push", secret)
            : await variants[v].testing.stripeRequest(
                payload,
                scenario === "invalid-signature" ? "wrong" : secret,
              )
      if (scenario === "content-type")
        req.headers.set("content-type", "text/plain")
      const start = performance.now(),
        response = await apps[v].handle(req, {
          provider: scenario === "missing-provider" ? "missing" : provider,
        }),
        elapsed = performance.now() - start
      const expected = {
        "missing-provider": [500, "HIBIKI_PROVIDER_NOT_REGISTERED"],
        "content-type": [415, "HIBIKI_UNSUPPORTED_CONTENT_TYPE"],
        parse: [400, "HIBIKI_PARSE_FAILED"],
        "strict-event": [400, "HIBIKI_UNSUPPORTED_EVENT"],
        pending: [503, "HIBIKI_EVENT_IN_PROGRESS"],
        "full-store": [503, "HIBIKI_IDEMPOTENCY_UNAVAILABLE"],
        "complete-failure": [503, "HIBIKI_IDEMPOTENCY_UNAVAILABLE"],
        "invalid-signature": [400, "HIBIKI_VERIFICATION_FAILED"],
      }[scenario]
      assert.equal(response.status, expected[0])
      assert.equal(await response.text(), expected[1])
      if (scenario === "missing-provider")
        assert.equal(await req.text(), "untouched")
      if (i >= 500) samples[v].push(elapsed)
    }
  assert.deepEqual(
    calls,
    scenario === "complete-failure" ? [2000, 2000] : [0, 0],
  )
  if (scenario === "pending")
    for (const store of stores)
      assert.equal(
        (await store.claim(JSON.stringify(["stripe", "evt-pending"]))).status,
        "pending",
      )
  const stats = samples.map((s) => {
    s.sort((a, b) => a - b)
    return {
      p50Us: s[749] * 1000,
      p95Us: s[1424] * 1000,
      meanUs: (s.reduce((a, b) => a + b) * 1000) / s.length,
    }
  })
  const r = { scenario, baseline: stats[0], candidate: stats[1] }
  results.push(r)
  console.log(JSON.stringify(r))
}
for (let v = 0; v < 2; v++)
  assert.equal(
    createHash("sha256")
      .update(await readFile(resolve(roots[v], "packages/core/dist/index.js")))
      .digest("hex"),
    variants[v].hash,
  )
await assertEnvironmentUnchanged(measuredEnvironment)
if (values.output)
  await writeFile(
    values.output,
    JSON.stringify(
      {
        ...measuredEnvironment,
        runtime: process.version,
        cpu: cpus()[0]?.model,
        hashes: variants.map((v) => v.hash),
        iterations: 1500,
        warmup: 500,
        concurrency: 1,
        results,
      },
      null,
      2,
    ) + "\n",
  )
