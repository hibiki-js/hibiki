import { createHash, randomUUID } from "node:crypto"
import { mkdtemp, mkdir, readFile, readdir, writeFile, cp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { contract, starter, honoStarter, tasks } from "./tasks.mjs"
import { execute, classify } from "./lib.mjs"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const hash = value => createHash("sha256").update(value).digest("hex")
const args = {}
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i]
  if (["--keep", "--dry-run"].includes(key)) args[key.slice(2)] = true
  else if (key.startsWith("--") && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) args[key.slice(2)] = process.argv[++i]
  else throw new Error(`Invalid argument: ${key}`)
}
const allowed = ["suite", "variant", "task", "fixture", "runs", "context", "label", "agent-command", "model", "harness", "report", "timeout-ms", "keep", "dry-run"]
for (const key of Object.keys(args)) if (!allowed.includes(key)) throw new Error(`Unknown option: --${key}`)
const suite = args.suite ?? "practical", variant = args.variant ?? "hibiki", task = args.task ?? "stripe-billing", context = args.context ?? "none"
const fixture = args.fixture ?? (suite === "adoption" ? "empty" : "hono")
if (!["empty", "hono"].includes(fixture) || (suite !== "adoption" && fixture !== "hono")) throw new Error("Value/practical use the Hono fixture; adoption accepts empty or hono")
const initialApp = fixture === "hono" ? honoStarter : starter
const runs = Number(args.runs ?? 3), timeoutMs = Number(args["timeout-ms"] ?? 600000)
if (!["adoption", "value", "practical"].includes(suite) || !Object.hasOwn(tasks, task) || !["none", "docs", "skill"].includes(context)) throw new Error("Invalid suite, task, or context")
if (!["hibiki", "raw", "sdk"].includes(variant) || (suite === "practical" && variant !== "hibiki")) throw new Error("Practical uses Hibiki; value accepts hibiki, raw, sdk")
if (!Number.isInteger(runs) || runs < 1 || runs > 100 || !Number.isInteger(timeoutMs) || timeoutMs < 1000) throw new Error("Invalid runs or timeout-ms")
const policy = suite === "value" ? {
  hibiki: "Use @hibiki-js/core and the Hibiki provider packages for verification and routing.",
  sdk: "Use the Stripe SDK and/or @octokit/webhooks for verification as appropriate. Do not use Hibiki.",
  raw: "Implement verification directly using Web Crypto or Node crypto. Do not use Hibiki or provider SDKs.",
}[variant] : suite === "practical" ? "Use the installed Hibiki packages for verification and routing." : ""
const prompts = tasks[task].map(prompt => `${prompt}\n${policy}`.trim())
if (args["dry-run"]) {
  console.log(JSON.stringify({ suite, variant: suite === "adoption" ? "neutral" : variant, task, fixture, context, runs, timeoutMs, prompts }, null, 2))
  process.exit(0)
}
if (!args["agent-command"] || !args.model || !args.harness || !args.report) throw new Error("Required: --agent-command '<JSON argv>' --model <id> --harness <id/version> --report <path>")
const command = JSON.parse(args["agent-command"])
if (!Array.isArray(command) || !command.length || command.some(value => typeof value !== "string")) throw new Error("agent-command must be a nonempty JSON string array")
const adapterHashes = []
for (let index = 0; index < command.length; index++) if (/\.(?:mjs|js|py|sh)$/.test(command[index])) {
  try { adapterHashes.push({ index, sha256: hash(await readFile(resolve(command[index]))) }) } catch {}
}
const temp = await mkdtemp(join(tmpdir(), "hibiki-eval-"))
const reportPath = resolve(args.report)
const report = {
  schemaVersion: 2, suite, variant: suite === "adoption" ? "neutral" : variant, task, fixture, context,
  label: args.label ?? "candidate", model: args.model, harness: args.harness,
  createdAt: new Date().toISOString(), timeoutMs, prompts, promptHash: hash(JSON.stringify(prompts)),
  taskPromptHash: hash(JSON.stringify(tasks[task])), policy,
  agentCommandHash: hash(JSON.stringify(command)),
  adapterHashes,
  runnerHash: hash(Buffer.concat(await Promise.all(["run.mjs", "lib.mjs", "source-metrics.mjs", "grade-file.mjs"].map(file => readFile(join(root, "evals", file)))))),
  agentConfig: { claudeBudgetUsd: process.env.HIBIKI_EVAL_CLAUDE_BUDGET_USD ?? "1" },
  graderHash: hash(await readFile(join(root, "evals/grader.mjs"))), runs: [],
}
async function requireSuccess(argv, cwd) {
  const result = await execute(argv, { cwd })
  if (result.code !== 0) throw new Error(`${argv[0]} failed: ${result.stderr || result.stdout}`)
  return result
}
try {
  // Pack the code under evaluation, so consumers use dist and published peer ranges, not source aliases.
  const packageSpecs = {}, packageHashes = {}
  if (suite !== "adoption" && variant === "hibiki") {
    await requireSuccess(["pnpm", "build"], root)
    const packDir = join(temp, "packages")
    await mkdir(packDir)
    for (const name of ["core", "stripe", "github", "hono", "testing"]) {
      const pkg = JSON.parse(await readFile(join(root, "packages", name, "package.json"), "utf8"))
      await requireSuccess(["pnpm", "pack", "--pack-destination", packDir], join(root, "packages", name))
      const file = join(packDir, `hibiki-js-${name}-${pkg.version}.tgz`)
      packageSpecs[pkg.name] = `file:${file}`
      packageHashes[pkg.name] = { version: pkg.version, sha256: hash(await readFile(file)) }
    }
  }
  const hono = JSON.parse(await readFile(join(root, "node_modules/hono/package.json"), "utf8")).version
  const dependencies = { ...(fixture === "hono" ? { hono } : {}), ...packageSpecs }
  if (suite === "value" && variant === "sdk") Object.assign(dependencies, { stripe: "23.0.0", "@octokit/webhooks": "14.2.0" })
  const compilerVersion = JSON.parse(await readFile(join(root, "node_modules/typescript/package.json"), "utf8")).version
  const nodeTypesVersion = JSON.parse(await readFile(join(root, "node_modules/@types/node/package.json"), "utf8")).version
  const devDependencies = { typescript: compilerVersion, "@types/node": nodeTypesVersion }
  const pkg = { private: true, type: "module", dependencies, devDependencies, scripts: { typecheck: "tsc --noEmit" } }
  const tsconfig = { compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", lib: ["ES2022", "DOM"], strict: true, skipLibCheck: true, outDir: ".eval-build" }, include: ["app.ts", "contract.ts", "src/**/*.ts"] }
  report.packageHashes = packageHashes
  report.dependencies = Object.fromEntries(Object.entries(dependencies).map(([name, spec]) => [name, spec.startsWith("file:") ? packageHashes[name].version : spec]))
  report.compilerVersion = compilerVersion
  report.nodeTypesVersion = nodeTypesVersion
  report.nodeVersion = process.version
  const revision = await execute(["git", "rev-parse", "HEAD"], { cwd: root })
  report.commit = revision.stdout.trim()
  // Context files are copied separately; their content hash identifies the treatment.
  const contextDir = join(temp, "context")
  await mkdir(contextDir)
  if (context === "docs") {
    await cp(join(root, "docs"), join(contextDir, "docs"), { recursive: true, filter: path => !path.includes(`${join("docs", ".vitepress")}`) && !path.includes(`${join("docs", "public")}`) })
    await writeFile(join(contextDir, "AGENTS.md"), "Hibiki documentation is available in docs/. Consult the provider and testing guides relevant to your task.\n")
  } else if (context === "skill") await cp(join(root, "skills/hibiki"), join(contextDir, ".agents/skills/hibiki"), { recursive: true })
  const contextFiles = []
  async function collect(dir, prefix = "") {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = join(prefix, entry.name)
      if (entry.isDirectory()) await collect(join(dir, entry.name), relative)
      else contextFiles.push([relative, hash(await readFile(join(dir, entry.name)))])
    }
  }
  await collect(contextDir)
  report.contextHash = hash(JSON.stringify(contextFiles))
  report.fixtureHash = hash(JSON.stringify({ contract, initialApp, tsconfig, fixture, hono: fixture === "hono" ? hono : null, devDependencies, task }))
  for (let index = 0; index < runs; index++) {
    const workspace = join(temp, `run-${index + 1}`), session = randomUUID()
    await mkdir(workspace)
    await cp(contextDir, workspace, { recursive: true })
    await writeFile(join(workspace, "package.json"), JSON.stringify(pkg, null, 2))
    await writeFile(join(workspace, "tsconfig.json"), JSON.stringify(tsconfig, null, 2))
    await writeFile(join(workspace, "contract.ts"), contract)
    await writeFile(join(workspace, "app.ts"), initialApp)
    const run = { index: index + 1, session, steps: [], success: false }
    let phase = "setup"
    if (args.keep) run.workspace = workspace
    report.runs.push(run)
    try {
      await requireSuccess(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], workspace)
      run.initialLockHash = hash(await readFile(join(workspace, "package-lock.json")))
      phase = "agent"
      for (let step = 0; step < prompts.length; step++) {
        const promptPath = join(temp, `prompt-${index}-${step}.txt`), metricsPath = join(temp, `metrics-${index}-${step}.json`)
        await writeFile(promptPath, prompts[step])
        const substitutions = { "{workspace}": workspace, "{prompt}": promptPath, "{session}": session, "{metrics}": metricsPath }
        const argv = command.map(value => Object.entries(substitutions).reduce((out, [key, replacement]) => out.replaceAll(key, replacement), value))
        const result = await execute(argv, { cwd: workspace, timeoutMs, env: { ...process.env, HIBIKI_EVAL_WORKSPACE: workspace, HIBIKI_EVAL_PROMPT: promptPath, HIBIKI_EVAL_SESSION: session, HIBIKI_EVAL_STEP: String(step), HIBIKI_EVAL_METRICS: metricsPath, HIBIKI_EVAL_MODEL: args.model, HIBIKI_EVAL_TIMEOUT_MS: String(timeoutMs) } })
        const item = { step, agentExitCode: result.code, timedOut: result.timedOut, durationMs: result.durationMs, success: false, inputTokens: null, outputTokens: null }
        run.steps.push(item)
        await writeFile(join(temp, `agent-${index}-${step}.log`), result.stdout + "\n" + result.stderr)
        try {
          const metrics = JSON.parse(await readFile(metricsPath, "utf8"))
          for (const key of ["inputTokens", "outputTokens"]) if (Number.isSafeInteger(metrics[key]) && metrics[key] >= 0) item[key] = metrics[key]
        } catch {} // absent metrics are unknown, never zero
        if (result.code !== 0 || result.timedOut) break
        if (await readFile(join(workspace, "contract.ts"), "utf8") !== contract) { item.error = "contract.ts was modified"; break }
        await rm(join(workspace, ".eval-build"), { recursive: true, force: true })
        // Pass compiler options on argv: agent edits to tsconfig cannot disable strict checking.
        const checked = await execute([process.execPath, join(root, "node_modules/typescript/bin/tsc"), "--strict", "--skipLibCheck", "--target", "ES2022", "--module", "ESNext", "--moduleResolution", "Bundler", "--lib", "ES2022,DOM", "--outDir", ".eval-build", "app.ts", "contract.ts"], { cwd: workspace })
        item.typecheck = checked.code === 0
        if (!item.typecheck) { item.error = (checked.stdout + checked.stderr).slice(-5000); break }
        const providers = task === "github-existing" ? "github" : task === "multi-provider-change" && step > 0 ? "stripe,github" : "stripe"
        const graded = await execute([process.execPath, join(root, "evals/grade-file.mjs"), join(workspace, ".eval-build/app.js"), providers], { cwd: workspace, timeoutMs: 30000 })
        if (graded.code === 0 && !graded.timedOut) {
          const output = graded.stdout.trim().split("\n").at(-1)
          item.grade = JSON.parse(output)
          item.success = item.grade.success === true
        } else item.error = graded.timedOut ? "grader timeout" : graded.stderr.slice(-5000)
        // Continue change requests even after a behavioral failure; each stage is independently graded.
      }
      run.classification = await classify(workspace)
      run.finalLockHash = hash(await readFile(join(workspace, "package-lock.json")))
      const imported = run.classification
      run.conditionMet = suite === "adoption" || (variant === "hibiki" ? imported.hibikiImported : variant === "sdk" ? imported.sdkImported && !imported.hibikiImported : !imported.hibikiImported && !imported.sdkImported)
      run.success = run.conditionMet && run.steps.length === prompts.length && run.steps.every(step => step.success)
    } catch (error) { run.error = String(error.message).slice(-5000); run.errorPhase = phase }
    console.error(`Run ${index + 1}/${runs}: ${run.success ? "pass" : "fail"}`)
  }
  const successes = report.runs.filter(run => run.success).length
  report.summary = { total: runs, successes, successRate: successes / runs, setupFailures: report.runs.filter(run => run.errorPhase === "setup").length, hibikiImported: report.runs.filter(run => run.classification?.hibikiImported).length }
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n")
  console.log(JSON.stringify(report.summary))
} finally {
  if (args.keep) console.error(`Artifacts: ${temp}`)
  else await rm(temp, { recursive: true, force: true })
}
