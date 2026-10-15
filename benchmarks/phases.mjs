import assert from "node:assert/strict"
import { parseArgs } from "node:util"
import { writeFile } from "node:fs/promises"
import { environment, assertEnvironmentUnchanged } from "./environment.mjs"
import { createFixture } from "./fixtures.mjs"
import { phases, createPhaseRecorder, loadInstrumentedCore } from "./phase-instrumentation.mjs"

const { values } = parseArgs({ options: {
  iterations: { type: "string", default: "500" },
  warmup: { type: "string", default: "50" },
  output: { type: "string" },
} })
const iterations = Number(values.iterations)
const warmup = Number(values.warmup)
assert.ok(Number.isSafeInteger(iterations) && iterations > 0 && iterations <= 5000, "iterations must be 1..5000")
assert.ok(Number.isSafeInteger(warmup) && warmup >= 0 && warmup <= 1000, "warmup must be 0..1000")

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b)
  const percentile = p => sorted[Math.ceil(p * sorted.length) - 1]
  return { meanMs: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    p50Ms: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99) }
}

const measuredEnvironment = await environment()
const core = await loadInstrumentedCore()
const recorder = createPhaseRecorder()
core.setPhaseRecorder(recorder.mark)
const results = []
try {
  for (const provider of ["stripe", "github", "discord"]) {
    for (const bytes of [1024, 10240, 102400]) {
      const count = iterations + warmup
      const baseline = await createFixture(provider, bytes, count)
      const profiled = await createFixture(provider, bytes, count, { HibikiClass: core.Hibiki })
      const totals = { baseline: [], profiled: [] }
      const spans = Object.fromEntries([...phases, "other"].map(phase => [phase, []]))
      for (let index = 0; index < count; index++) {
        // Alternate order to limit systematic warmup/GC/scheduling bias. Each
        // fixture has its own store and unique signed IDs, including warmup.
        const order = index % 2 ? ["profiled", "baseline"] : ["baseline", "profiled"]
        for (const kind of order) {
          const fixture = kind === "baseline" ? baseline : profiled
          const input = await fixture.prepare(index)
          const start = performance.now()
          await fixture.handle(input)
          const totalMs = performance.now() - start
          const sample = kind === "profiled" ? recorder.finish(totalMs) : undefined
          if (index < warmup) continue
          totals[kind].push(totalMs)
          if (sample) for (const phase of Object.keys(spans)) spans[phase].push(sample[phase])
        }
      }
      baseline.assertDispatched()
      profiled.assertDispatched()
      const total = summarize(totals.profiled)
      const phaseResults = Object.fromEntries(Object.entries(spans).map(([phase, samples]) => {
        const summary = summarize(samples)
        return [phase, { ...summary, shareOfMeanPercent: summary.meanMs / total.meanMs * 100 }]
      }))
      const uninstrumentedTotal = summarize(totals.baseline)
      results.push({ provider, bytes, iterations, total, uninstrumentedTotal,
        // This delta includes noise and may be negative; it is not a correction.
        instrumentationMeanDeltaMs: total.meanMs - uninstrumentedTotal.meanMs, phases: phaseResults })
      console.log(`${provider.padEnd(7)} ${String(bytes / 1024).padStart(3)} KiB profiled p50=${(total.p50Ms * 1000).toFixed(1)}µs baseline=${(uninstrumentedTotal.p50Ms * 1000).toFixed(1)}µs`)
      for (const [phase, summary] of Object.entries(phaseResults)) {
        console.log(`  ${phase.padEnd(13)} mean=${(summary.meanMs * 1000).toFixed(1)}µs p50=${(summary.p50Ms * 1000).toFixed(1)}µs p95=${(summary.p95Ms * 1000).toFixed(1)}µs share=${summary.shareOfMeanPercent.toFixed(1)}%`)
      }
    }
  }
  await assertEnvironmentUnchanged(measuredEnvironment)
  const report = { schemaVersion: 1, benchmark: "handle-phases", ...measuredEnvironment,
    concurrency: 1, iterations, warmup, store: "default-memory", middleware: false,
    instrumentation: "temporary built Core copy; synchronous boundary timestamps; alternating baseline/profiled requests",
    results }
  if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + "\n")
} finally {
  await core.dispose()
}
