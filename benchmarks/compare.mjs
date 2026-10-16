import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import { environment, assertEnvironmentUnchanged } from "./environment.mjs"

const { values } = parseArgs({ options: {
  baseline: { type: "string" }, output: { type: "string" },
  iterations: { type: "string", default: "1500" },
  warmup: { type: "string", default: "500" },
} })
assert.ok(values.baseline, "Pass --baseline PATH to a separately built checkout")
const iterations = Number(values.iterations), warmup = Number(values.warmup)
assert.ok(Number.isSafeInteger(iterations) && iterations > 0 && iterations <= 5000, "iterations must be 1..5000")
assert.ok(Number.isSafeInteger(warmup) && warmup >= 0 && warmup <= 1000, "warmup must be 0..1000")
const roots = [resolve(values.baseline), process.cwd()]
assert.notEqual(roots[0], roots[1], "Use a separate baseline checkout")
const measuredEnvironment = await environment()
const hash = async file => createHash("sha256").update(await readFile(file)).digest("hex")
const baselineHashes = {}
for (const name of Object.keys(measuredEnvironment.builtPackageSha256)) {
  baselineHashes[name] = await hash(resolve(roots[0], `packages/${name}/dist/index.js`))
}
assert.equal(await hash(resolve(roots[0], "pnpm-lock.yaml")), measuredEnvironment.lockfileSha256, "Use identical lockfiles")
assert.equal(await hash(resolve(roots[0], "benchmarks/fixtures.mjs")), await hash("benchmarks/fixtures.mjs"), "Use identical timing fixtures")
const factories = await Promise.all(roots.map(async root =>
  (await import(pathToFileURL(resolve(root, "benchmarks/fixtures.mjs")).href)).createFixture,
))
const results = []
for (const provider of ["stripe", "github", "discord"]) {
  for (const bytes of [1024, 10240, 102400]) {
    for (const operation of ["verify", "handle"]) {
      const fixtures = await Promise.all(factories.map(create => create(provider, bytes, warmup + iterations)))
      const samples = [[], []]
      for (let index = 0; index < warmup + iterations; index++) {
        // Alternate each pair to reduce drift from JIT, GC and background load.
        for (const variant of index % 2 ? [1, 0] : [0, 1]) {
          const input = await fixtures[variant].prepare(index)
          const start = performance.now()
          await fixtures[variant][operation](input)
          if (index >= warmup) samples[variant].push(performance.now() - start)
        }
      }
      if (operation === "handle") fixtures.forEach(fixture => fixture.assertDispatched())
      const stats = samples.map(sample => {
        sample.sort((a, b) => a - b)
        const meanMs = sample.reduce((sum, value) => sum + value, 0) / sample.length
        return {
          meanMs, p50Ms: sample[Math.ceil(sample.length * 0.5) - 1],
          p95Ms: sample[Math.ceil(sample.length * 0.95) - 1],
          p99Ms: sample[Math.ceil(sample.length * 0.99) - 1],
          opsPerSecond: 1000 / meanMs,
        }
      })
      const result = { provider, bytes, operation, baseline: stats[0], candidate: stats[1] }
      results.push(result)
      console.log(JSON.stringify(result))
    }
  }
}
for (const [name, expected] of Object.entries(baselineHashes)) {
  assert.equal(await hash(resolve(roots[0], `packages/${name}/dist/index.js`)), expected, "Baseline build changed during measurement")
}
assert.equal(await hash(resolve(roots[0], "pnpm-lock.yaml")), measuredEnvironment.lockfileSha256, "Baseline lockfile changed during measurement")
await assertEnvironmentUnchanged(measuredEnvironment)
if (values.output) await writeFile(values.output, JSON.stringify({
  schemaVersion: 1, ...measuredEnvironment, baseline: roots[0], baselineHashes,
  iterations, warmup, concurrency: 1, results,
}, null, 2) + "\n")
