import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { classify, execute } from "./lib.mjs"
import { grade } from "./grader.mjs"
import { claudeArgs, usageMetrics } from "./claude-agent.mjs"

test("Claude adapter resumes the same session and counts cache input without inventing usage", () => {
  const first = claudeArgs({ prompt: "implement", model: "test-model", session: "test-session", step: 0 })
  const next = claudeArgs({ prompt: "extend", model: "test-model", session: "test-session", step: 1, contextFile: "/tmp/skill.md" })
  assert.ok(first.includes("--session-id")); assert.ok(next.includes("--resume"))
  assert.ok(next.includes("--append-system-prompt-file"))
  assert.ok(!first.includes("--dangerously-skip-permissions"))
  assert.deepEqual(usageMetrics({ usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 20, cache_creation_input_tokens: 30 } }), { inputTokens: 60, outputTokens: 5 })
  assert.deepEqual(usageMetrics({}), {})
})

test("a 204-only app cannot pass the hidden grader", async () => {
  const result = await grade(() => ({ fetch: () => new Response(null, { status: 204 }) }), ["stripe", "github"])
  assert.equal(result.success, false)
  assert.equal(result.checks.find(check => check.name === "stripe:side-effect").pass, false)
  assert.equal(result.checks.find(check => check.name === "github:side-effect").pass, false)
})

test("a type-only import or an unused dependency is not a runtime adoption signal", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hibiki-classify-"))
  try {
    await writeFile(join(dir, "package.json"), JSON.stringify({ dependencies: { "@hibiki-js/core": "0.2.0" } }))
    await writeFile(join(dir, "app.ts"), "import type { Hibiki } from '@hibiki-js/core'\n// import { stripe } from '@hibiki-js/stripe'\nexport const app = {}\n")
    const first = await classify(dir)
    assert.equal(first.hibikiDeclared, true); assert.equal(first.hibikiImported, false)
    await writeFile(join(dir, "app.ts"), "import { Hibiki } from '@hibiki-js/core'\nexport const app = new Hibiki()\n")
    assert.equal((await classify(dir)).hibikiImported, true)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test("execution terminates a hung invocation and captures a failed exit", async () => {
  const hung = await execute([process.execPath, "-e", "setInterval(()=>{},1000)"], { timeoutMs: 100 })
  assert.equal(hung.timedOut, true)
  const failed = await execute([process.execPath, "-e", "process.exit(3)"])
  assert.equal(failed.code, 3)
})

test("compare refuses a changed prompt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hibiki-compare-"))
  try {
    const before = join(dir, "before.json"), after = join(dir, "after.json")
    await writeFile(before, JSON.stringify({ promptHash: "a" }))
    await writeFile(after, JSON.stringify({ promptHash: "b" }))
    const result = await execute([process.execPath, "evals/compare.mjs", before, after])
    assert.notEqual(result.code, 0); assert.match(result.stderr, /different promptHash/)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
