import assert from "node:assert/strict"
import { parseArgs } from "node:util"
import { writeFile } from "node:fs/promises"
import { environment } from "./environment.mjs"
import { createFixture } from "./fixtures.mjs"

const { values } = parseArgs({ options: {
  iterations: { type: "string", default: "500" },
  warmup: { type: "string", default: "50" },
  output: { type: "string" },
} })
const iterations = Number(values.iterations)
const warmup = Number(values.warmup)
assert.ok(Number.isSafeInteger(iterations) && iterations > 0 && iterations <= 5000, "iterations must be 1..5000")
assert.ok(Number.isSafeInteger(warmup) && warmup >= 0 && warmup <= 1000, "warmup must be 0..1000")
const results = []
for (const provider of ["stripe", "github", "discord"]) {
  for (const bytes of [1024, 10240, 102400]) {
    // Separate fixtures isolate verification-only and complete dispatch measurements.
    for (const operation of ["verify", "handle"]) {
      const fixture = await createFixture(provider, bytes, iterations + warmup)
      for (let index = 0; index < warmup; index++) await fixture[operation](await fixture.prepare(index))
      const samples = []
      for (let index = warmup; index < iterations + warmup; index++) {
        const input = await fixture.prepare(index)
        const start = performance.now()
        await fixture[operation](input)
        samples.push(performance.now() - start)
      }
      if (operation === "handle") fixture.assertDispatched()
      samples.sort((a, b) => a - b)
      const meanMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
      const percentile = p => samples[Math.ceil(p * samples.length) - 1]
      const result = { provider, bytes, operation, iterations, meanMs, p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), opsPerSecond: 1000 / meanMs }
      results.push(result)
      console.log(`${provider.padEnd(7)} ${String(bytes / 1024).padStart(3)} KiB ${operation.padEnd(6)} p50=${result.p50Ms.toFixed(3)}ms p95=${result.p95Ms.toFixed(3)}ms ${result.opsPerSecond.toFixed(0)} ops/s`)
    }
  }
}
const report = {
  schemaVersion: 1,
  ...await environment(),
  concurrency: 1, iterations, warmup, results,
}
if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + "\n")
