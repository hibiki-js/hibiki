import { createHash } from "node:crypto"
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { applicationMetrics } from "./source-metrics.mjs"

const folder = resolve(process.argv[2] ?? "evals/results/subagents-2026-10-12")
const recovery = JSON.parse(await readFile(join(folder, "recovery.json"), "utf8"))
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const summary = {
  date: "2026-10-12", model: "session-inherited", exactModelId: null,
  harness: "codex-collaboration-fork-none", repetitionsPerCondition: 3,
  task: "multi-provider-change", timingComparable: false, tokenUsageAvailable: false,
  notes: [
    "Each run uses a fresh no-history subagent. The second change uses the same agent conversation.",
    "The exact model identifier and per-agent token counters are not exposed by the collaboration interface.",
    "Bridge duration includes controller waiting, including a conversation pause. It is not comparable model execution time.",
    "Three runs had controller timeout records; original reports are preserved and deterministic recovery checks are separately recorded.",
    "github:non-json rejects JSON bodies labeled with a non-JSON Content-Type. The prompt did not explicitly require that rejection.",
    "The adjusted pass count excluding github:non-json is a post-hoc sensitivity analysis, not the original success metric.",
    "Application line counts follow imports from app.ts, exclude contract.ts and standalone test scripts, and include nonblank comments/formatting.",
    "Static helper references indicate generated code choices, not instrumented tool usage or verified test coverage.",
    "Workspace boundaries are instructed, not enforced by filesystem isolation. This is an exploratory single-task/single-model study.",
  ], conditions: [],
}
for (const condition of ["raw", "sdk", "old", "hibiki", "skill", "adoption"]) {
  const report = JSON.parse(await readFile(join(folder, `${condition}.json`), "utf8"))
  const runs = []
  for (const original of report.runs) {
    const recovered = recovery.entries.filter(entry => entry.condition === condition && entry.index === original.index)
    const steps = new Map(original.steps.map(step => [step.step, step]))
    for (const entry of recovered) steps.set(entry.step, { step: entry.step, typecheck: entry.typecheck, contractUnchanged: entry.contractUnchanged, grade: entry.grade, recovered: true })
    const ordered = [...steps.values()].sort((a, b) => a.step - b.step)
    const source = await applicationMetrics(original.workspace)
    const usesHibiki = source.imports.some(name => name.startsWith("@hibiki-js/"))
    const usesSDK = source.imports.some(name => name === "stripe" || name.startsWith("@octokit/webhooks"))
    const conditionMet = condition === "adoption" || (condition === "raw" ? !usesHibiki && !usesSDK : condition === "sdk" ? usesSDK && !usesHibiki : usesHibiki)
    const complete = ordered.length === 2 && ordered.every(step => step.typecheck && step.contractUnchanged !== false && step.grade)
    const failures = ordered.flatMap(step => (step.grade?.checks ?? []).filter(check => !check.pass).map(check => ({ step: step.step, name: check.name })))
    const artifact = join(folder, "artifacts", `${condition}-${original.index}`)
    await mkdir(artifact, { recursive: true })
    const hashes = {}
    const helperReferences = Object.fromEntries(["emitTypedEvent", "emitEvent", "requestEvent", "createWebhookTest", "stripeRequest", "githubRequest"].map(name => [name, 0]))
    async function archive(dir, relative = "") {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (["node_modules", ".eval-build", ".git", ".agents", "docs"].includes(entry.name)) continue
        const path = join(dir, entry.name), target = join(artifact, relative, entry.name)
        if (entry.isDirectory()) await archive(path, join(relative, entry.name))
        else {
          await mkdir(join(artifact, relative), { recursive: true })
          await cp(path, target)
          const content = await readFile(path)
          hashes[join(relative, entry.name)] = createHash("sha256").update(content).digest("hex")
          if (/\.[cm]?[jt]sx?$/.test(entry.name) && !source.files.includes(join(relative, entry.name)) && entry.name !== "contract.ts" && /["']@hibiki-js\/testing["']/.test(content.toString())) {
            for (const name of Object.keys(helperReferences)) helperReferences[name] += [...content.toString().matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))].length
          }
        }
      }
    }
    await archive(original.workspace)
    const run = {
      index: original.index, complete, conditionMet,
      strictPass: complete && conditionMet && failures.length === 0,
      adjustedPass: complete && conditionMet && failures.every(failure => failure.name === "github:non-json"),
      controllerRecovered: recovered.length > 0, failures, source,
      helperReferences, usesHibiki, usesSDK, artifact: `artifacts/${condition}-${original.index}`, hashes,
    }
    runs.push(run)
  }
  summary.conditions.push({
    condition, n: runs.length, strictPasses: runs.filter(run => run.strictPass).length,
    adjustedPasses: runs.filter(run => run.adjustedPass).length,
    hibikiImports: runs.filter(run => run.usesHibiki).length,
    sdkImports: runs.filter(run => run.usesSDK).length,
    medianApplicationLines: median(runs.map(run => run.source.nonblankLines)),
    medianApplicationStatements: median(runs.map(run => run.source.statements)),
    typeAssertions: runs.map(run => run.source.assertions), explicitAny: runs.map(run => run.source.explicitAny),
    report: `${condition}.json`, packageHashes: report.packageHashes, promptHash: report.promptHash,
    taskPromptHash: report.taskPromptHash, fixtureHash: report.fixtureHash, graderHash: report.graderHash,
    runnerHash: report.runnerHash, compilerVersion: report.compilerVersion, nodeVersion: report.nodeVersion,
    contextHash: report.contextHash, runs,
  })
}
await writeFile(join(folder, "summary.json"), JSON.stringify(summary, null, 2) + "\n")
console.log(JSON.stringify(summary.conditions.map(({ condition, n, strictPasses, adjustedPasses, hibikiImports, medianApplicationLines, medianApplicationStatements, typeAssertions, explicitAny }) => ({ condition, n, strictPasses, adjustedPasses, hibikiImports, medianApplicationLines, medianApplicationStatements, typeAssertions, explicitAny })), null, 2))
