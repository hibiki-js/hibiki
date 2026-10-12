import { readFile } from "node:fs/promises"
const [before, after] = await Promise.all(process.argv.slice(2).map(async path => JSON.parse(await readFile(path, "utf8"))))
if (!before || !after || process.argv.length !== 4) throw new Error("Usage: node evals/compare.mjs baseline.json candidate.json")
const promptKey = before.suite === "value" && before.variant !== after.variant ? "taskPromptHash" : "promptHash"
for (const key of ["schemaVersion", "suite", "task", promptKey, "fixtureHash", "graderHash", "runnerHash", "agentCommandHash", "adapterHashes", "agentConfig", "model", "harness", "compilerVersion", "nodeVersion", "timeoutMs"]) {
  if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) throw new Error(`Cannot compare different ${key}`)
}
if (before.suite === "value" && before.variant !== after.variant && (before.context !== after.context || before.contextHash !== after.contextHash)) throw new Error("Cross-variant value comparisons require identical context")
const median = values => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
function summarize(report, successfulOnly = false) {
  const runs = report.runs.filter(run => !successfulOnly || run.success)
  const totals = key => runs.map(run => {
    if (!run.steps.length || run.steps.some(step => !Number.isFinite(step[key]))) return null
    return run.steps.reduce((sum, step) => sum + step[key], 0)
  })
  const tokens = runs.map(run => {
    if (!run.steps.length || run.steps.some(step => step.inputTokens === null || step.outputTokens === null)) return null
    return run.steps.reduce((sum, step) => sum + step.inputTokens + step.outputTokens, 0)
  })
  return {
    n: runs.length, successes: runs.filter(run => run.success).length,
    medianAgentMs: median(totals("durationMs").filter(value => value !== null)),
    medianTokens: tokens.includes(null) ? null : median(tokens),
    medianImplementationLines: median(runs.map(run => run.classification?.implementationLines).filter(Number.isFinite)),
  }
}
console.log(JSON.stringify({
  baseline: { label: before.label, variant: before.variant, context: before.context, all: summarize(before), successful: summarize(before, true) },
  candidate: { label: after.label, variant: after.variant, context: after.context, all: summarize(after), successful: summarize(after, true) },
  note: "Counts and descriptive medians; small samples do not establish a statistically reliable improvement. Tokens are null if any included run lacks metrics.",
}, null, 2))
