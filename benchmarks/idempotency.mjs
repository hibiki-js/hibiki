import assert from "node:assert/strict"
import { parseArgs } from "node:util"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { cpus } from "node:os"

const { values } = parseArgs({
  options: {
    baseline: { type: "string" },
    output: { type: "string" },
  },
})
assert.ok(
  values.baseline,
  "Pass --baseline PATH to a separately built checkout",
)
const variants = await Promise.all(
  [values.baseline, process.cwd()].map(async (root) => {
    const file = resolve(root, "packages/core/dist/index.js")
    return {
      root: resolve(root),
      sha256: createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
      module: await import(pathToFileURL(file).href),
    }
  }),
)
const report = {
  runtime: process.version,
  cpu: cpus()[0]?.model,
  concurrency: 1,
  variants: variants.map(({ module, ...metadata }) => metadata),
  results: [],
}
const now = Date.now
let clock = 1_700_000_000_000
Date.now = () => clock
const stats = (samples) => {
  const sorted = samples.toSorted((a, b) => a - b)
  return {
    samples: sorted.length,
    p50Us: sorted[Math.ceil(sorted.length * 0.5) - 1] * 1000,
    p95Us: sorted[Math.ceil(sorted.length * 0.95) - 1] * 1000,
  }
}
try {
  for (const { module } of variants) {
    const store = module.createMemoryIdempotencyStore()
    for (let i = 0; i < 1000; i++) {
      const claim = await store.claim("warmup")
      assert.equal(claim.status, "acquired")
      await store.release("warmup", claim.token)
    }
  }
  for (const count of [0, 1000, 10000]) {
    const first = [[], []],
      drain = [[], []]
    for (let trial = 0; trial < 30; trial++) {
      for (const variant of trial % 2 ? [1, 0] : [0, 1]) {
        clock = 1_700_000_000_000
        const store = variants[variant].module.createMemoryIdempotencyStore({
          retentionMs: 100,
          maxEntries: 10001,
        })
        for (let i = 0; i < count; i++) {
          const claim = await store.claim(`completed-${i}`)
          assert.equal(claim.status, "acquired")
          await store.complete(`completed-${i}`, claim.token)
        }
        clock += 100
        const start = performance.now()
        const claim = await store.claim("first-after-expiry")
        first[variant].push(performance.now() - start)
        assert.equal(claim.status, "acquired")
        await store.release("first-after-expiry", claim.token)
        // Same number of subsequent claims for both versions measures the
        // entire amortization window, rather than only hiding cleanup work.
        for (let i = 0; i < Math.ceil(count / 128); i++) {
          const next = await store.claim("drain")
          assert.equal(next.status, "acquired")
          await store.release("drain", next.token)
        }
        drain[variant].push(performance.now() - start)
      }
    }
    report.results.push({
      case: "first claim after expiry",
      expired: count,
      baseline: stats(first[0]),
      candidate: stats(first[1]),
    })
    report.results.push({
      case: "entire cleanup window",
      expired: count,
      baseline: stats(drain[0]),
      candidate: stats(drain[1]),
    })
  }
  for (const operation of ["new", "pending", "completed"]) {
    const stores = variants.map(({ module }) =>
      module.createMemoryIdempotencyStore(),
    )
    if (operation !== "new")
      for (const store of stores) {
        const claim = await store.claim("existing")
        assert.equal(claim.status, "acquired")
        if (operation === "completed")
          await store.complete("existing", claim.token)
      }
    const samples = [[], []]
    for (let batch = 0; batch < 100; batch++)
      for (const variant of batch % 2 ? [1, 0] : [0, 1]) {
        const start = performance.now()
        for (let i = 0; i < 1000; i++) {
          const claim = await stores[variant].claim("existing")
          assert.equal(
            claim.status,
            operation === "new" ? "acquired" : operation,
          )
          if (operation === "new")
            await stores[variant].release("existing", claim.token)
        }
        samples[variant].push((performance.now() - start) / 1000)
      }
    report.results.push({
      case: `steady ${operation}`,
      baseline: stats(samples[0]),
      candidate: stats(samples[1]),
    })
  }
  for (const operation of ["complete", "claim and complete", "expiry churn"]) {
    const samples = [[], []]
    for (let batch = 0; batch < 100; batch++) {
      for (const variant of batch % 2 ? [1, 0] : [0, 1]) {
        const store = variants[variant].module.createMemoryIdempotencyStore({ retentionMs: 100, maxEntries: 1000 })
        const keys = Array.from({ length: 1000 }, (_, i) => `event-${i}`)
        const tokens = []
        if (operation !== "claim and complete") {
          for (const key of keys) {
            const claim = await store.claim(key)
            assert.equal(claim.status, "acquired")
            tokens.push(claim.token)
            if (operation === "expiry churn") await store.complete(key, claim.token)
          }
          clock += 100
        }
        const start = performance.now()
        for (let i = 0; i < keys.length; i++) {
          let token = tokens[i]
          if (operation !== "complete") {
            const claim = await store.claim(keys[i])
            assert.equal(claim.status, "acquired")
            token = claim.token
          }
          await store.complete(keys[i], token)
        }
        samples[variant].push((performance.now() - start) / keys.length)
        for (const key of keys) assert.equal((await store.claim(key)).status, "completed")
      }
    }
    report.results.push({ case: operation, baseline: stats(samples[0]), candidate: stats(samples[1]) })
  }
} finally {
  Date.now = now
}
for (const variant of variants) {
  assert.equal(createHash("sha256").update(await readFile(resolve(variant.root, "packages/core/dist/index.js"))).digest("hex"), variant.sha256, "Built Core changed during measurement")
}
for (const result of report.results) console.log(JSON.stringify(result))
if (values.output)
  await writeFile(values.output, JSON.stringify(report, null, 2) + "\n")
