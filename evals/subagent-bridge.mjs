// Connect the existing runner to a conversation-controlled subagent.
// The controller starts/resumes an agent from the request and writes the completion file.
import { mkdir, writeFile, readFile } from "node:fs/promises"
import { join } from "node:path"

const env = process.env
if (!env.HIBIKI_EVAL_QUEUE_DIR || !env.HIBIKI_EVAL_SESSION || !env.HIBIKI_EVAL_PROMPT) throw new Error("Missing evaluation bridge environment")
await mkdir(env.HIBIKI_EVAL_QUEUE_DIR, { recursive: true })
const id = `${env.HIBIKI_EVAL_SESSION}.${env.HIBIKI_EVAL_STEP}`
const request = {
  session: env.HIBIKI_EVAL_SESSION, step: Number(env.HIBIKI_EVAL_STEP),
  workspace: env.HIBIKI_EVAL_WORKSPACE,
  prompt: await readFile(env.HIBIKI_EVAL_PROMPT, "utf8"),
  requestedAt: new Date().toISOString(),
}
await writeFile(join(env.HIBIKI_EVAL_QUEUE_DIR, `${id}.request.json`), JSON.stringify(request, null, 2))
const started = Date.now()
while (Date.now() - started < Number(env.HIBIKI_EVAL_TIMEOUT_MS ?? 600000)) {
  let completion
  try { completion = JSON.parse(await readFile(join(env.HIBIKI_EVAL_QUEUE_DIR, `${id}.done.json`), "utf8")) }
  catch (error) { if (error.code !== "ENOENT") throw error }
  if (completion) {
    if (!Number.isInteger(completion.exitCode) || completion.exitCode < 0 || completion.exitCode > 255) throw new Error("Invalid completion exitCode")
    // The controller records completion; agents never self-grade.
    console.log(JSON.stringify({ agentId: completion.agentId, completedAt: completion.completedAt }))
    process.exit(completion.exitCode)
  }
  await new Promise(resolve => setTimeout(resolve, 250))
}
throw new Error("Subagent controller timed out")
