import { readdir } from "node:fs/promises"
import { spawn } from "node:child_process"

const examples = await readdir("examples", { withFileTypes: true })
const dirs = examples.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
if (dirs.length === 0) throw new Error("No examples found")

await new Promise((resolve, reject) => {
  const child = spawn("pnpm", ["exec", "tsc", "--noEmit", "--pretty", "false"], {
    stdio: "inherit",
    env: process.env,
  })
  child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`examples typecheck failed: ${code}`))))
})

console.log(`Checked examples: ${dirs.join(", ")}`)
