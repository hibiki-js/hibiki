import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { cpus } from "node:os"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

const { values } = parseArgs({ options: {
  baseline: { type: "string" }, output: { type: "string" },
  worker: { type: "string" }, scenario: { type: "string" },
} })
const scenarios = ["empty", "pending", "completed", "drained", "churn"]
if (values.worker) {
  assert.equal(typeof global.gc, "function", "Run child with --expose-gc")
  assert.ok(scenarios.includes(values.scenario))
  const { createMemoryIdempotencyStore } = await import(pathToFileURL(resolve(values.worker, "packages/core/dist/index.js")).href)
  const keys = Array.from({ length: 10000 }, (_, i) => `event-${i}`)
  globalThis.retainedKeys = keys
  let clock = 1_700_000_000_000
  Date.now = () => clock
  const fill = async (store, complete) => {
    for (const key of keys) {
      const claim = await store.claim(key)
      assert.equal(claim.status, "acquired")
      if (complete) await store.complete(key, claim.token)
    }
  }
  // No temporary populated store: an async frame can keep it alive through the
  // first collection and otherwise produce a misleading negative heap delta.
  const collect = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise(resolve => setImmediate(resolve))
      global.gc()
    }
    return process.memoryUsage().heapUsed
  }
  const before = await collect()
  const stores = Array.from({ length: values.scenario === "empty" ? 1000 : 1 }, () => createMemoryIdempotencyStore({ retentionMs: 100 }))
  globalThis.retainedStores = stores
  if (values.scenario !== "empty") {
    const store = stores[0]
    await fill(store, values.scenario !== "pending")
    if (values.scenario === "churn") {
      for (let round = 0; round < 10; round++) {
        clock += 100
        await fill(store, true)
      }
    }
    if (values.scenario === "drained") {
      clock += 100
      for (let i = 0; i < Math.ceil(keys.length / 128); i++) {
        const claim = await store.claim("drain")
        assert.equal(claim.status, "acquired")
        await store.release("drain", claim.token)
      }
    }
    if (values.scenario === "completed" || values.scenario === "churn") {
      for (const key of keys) assert.equal((await store.claim(key)).status, "completed")
    }
  }
  const after = await collect()
  // Keep common keys and measured stores alive through the final collection.
  assert.equal(keys.length, 10000)
  assert.equal(globalThis.retainedStores, stores)
  console.log(JSON.stringify({ retainedHeapBytes: after - before, stores: stores.length, entries: ["empty", "drained"].includes(values.scenario) ? 0 : keys.length }))
} else {
  assert.ok(values.baseline, "Pass --baseline PATH to a separately built checkout")
  const roots = [resolve(values.baseline), process.cwd()]
  const hashes = await Promise.all(roots.map(async root => createHash("sha256").update(await readFile(resolve(root, "packages/core/dist/index.js"))).digest("hex")))
  const report = { runtime: process.version, cpu: cpus()[0]?.model, roots, hashes, metric: "retained JS heap after GC, not peak memory or total allocations", results: [] }
  for (const scenario of scenarios) {
    const samples = [[], []]
    for (let trial = 0; trial < 5; trial++) {
      for (const variant of trial % 2 ? [1, 0] : [0, 1]) {
        const result = JSON.parse(execFileSync(process.execPath, ["--expose-gc", fileURLToPath(import.meta.url), "--worker", roots[variant], "--scenario", scenario], { encoding: "utf8" }))
        samples[variant].push(result.retainedHeapBytes)
      }
    }
    const result = { scenario, baselineBytes: samples[0], candidateBytes: samples[1] }
    report.results.push(result)
    console.log(JSON.stringify(result))
  }
  for (let i = 0; i < roots.length; i++) assert.equal(createHash("sha256").update(await readFile(resolve(roots[i], "packages/core/dist/index.js"))).digest("hex"), hashes[i])
  if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + "\n")
}
