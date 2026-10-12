import { readFile, writeFile, access } from "node:fs/promises"
import { resolve, join } from "node:path"
import { pathToFileURL } from "node:url"
import { execute } from "./lib.mjs"

/** Controlled CLI configuration, without permission bypass or host customizations. */
export function claudeArgs({ prompt, model, session, step, contextFile, budget = "1" }) {
  const argv = ["claude", "--safe-mode", "-p", prompt, "--model", model, "--output-format", "json",
    "--tools", "Read,Edit,Write,Glob,Grep,Bash,WebFetch,WebSearch",
    "--allowedTools", "Read,Edit,Write,Glob,Grep,Bash,WebFetch,WebSearch",
    "--max-turns", "40", "--max-budget-usd", budget,
    step === 0 ? "--session-id" : "--resume", session]
  if (contextFile) argv.push("--append-system-prompt-file", contextFile)
  return argv
}

/** Usage is per CLI invocation; cache input still consumes model context. */
export function usageMetrics(result) {
  const usage = result.usage
  if (!usage || !Number.isSafeInteger(usage.input_tokens) || !Number.isSafeInteger(usage.output_tokens)) return {}
  const cacheRead = usage.cache_read_input_tokens ?? 0, cacheCreate = usage.cache_creation_input_tokens ?? 0
  if (![usage.input_tokens, usage.output_tokens, cacheRead, cacheCreate].every(value => Number.isSafeInteger(value) && value >= 0)) return {}
  return { inputTokens: usage.input_tokens + cacheRead + cacheCreate, outputTokens: usage.output_tokens }
}

async function main() {
  const { HIBIKI_EVAL_PROMPT: promptPath, HIBIKI_EVAL_WORKSPACE: workspace, HIBIKI_EVAL_MODEL: model, HIBIKI_EVAL_SESSION: session, HIBIKI_EVAL_METRICS: metricsPath } = process.env
  if (!promptPath || !workspace || !model || !session || !metricsPath) throw new Error("Run this adapter through pnpm eval:agents")
  const step = Number(process.env.HIBIKI_EVAL_STEP)
  const budget = process.env.HIBIKI_EVAL_CLAUDE_BUDGET_USD ?? "1"
  if (!(Number(budget) > 0) || !Number.isFinite(Number(budget))) throw new Error("Invalid Claude per-step budget")
  let contextFile
  for (const path of [join(workspace, "AGENTS.md"), join(workspace, ".agents/skills/hibiki/SKILL.md")]) {
    try { await access(path); contextFile = path } catch {}
  }
  const result = await execute(claudeArgs({ prompt: await readFile(promptPath, "utf8"), model, session, step, contextFile, budget }), {
    cwd: workspace, timeoutMs: Number(process.env.HIBIKI_EVAL_TIMEOUT_MS ?? 600000), isolateProcessGroup: false,
  })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  if (result.code !== 0 || result.timedOut) { process.exitCode = result.code || 1; return }
  const output = JSON.parse(result.stdout)
  await writeFile(metricsPath, JSON.stringify(usageMetrics(output)))
  if (output.is_error) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
