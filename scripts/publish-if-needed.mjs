import { readdir, readFile } from "node:fs/promises"
import { spawn } from "node:child_process"

const token = process.env.NODE_AUTH_TOKEN
if (!token) throw new Error("NODE_AUTH_TOKEN is required")

async function published(name, version) {
  const url = `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`
  const response = await fetch(url)
  return response.status === 200
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: { ...process.env, NODE_AUTH_TOKEN: token },
    })
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))))
  })
}

const entries = await readdir("packages", { withFileTypes: true })
for (const entry of entries.filter((item) => item.isDirectory())) {
  const pkg = JSON.parse(await readFile(`packages/${entry.name}/package.json`, "utf8"))
  if (pkg.private) continue
  if (await published(pkg.name, pkg.version)) {
    console.log(`skip ${pkg.name}@${pkg.version}`)
    continue
  }
  console.log(`publish ${pkg.name}@${pkg.version}`)
  await run("pnpm", ["publish", "--access", "public", "--no-git-checks"], `packages/${entry.name}`)
}
