import { readdir, readFile } from "node:fs/promises"

const packages = await readdir("packages", { withFileTypes: true })
for (const entry of packages.filter((entry) => entry.isDirectory())) {
  const file = `packages/${entry.name}/package.json`
  const pkg = JSON.parse(await readFile(file, "utf8"))
  if (Object.keys(pkg.dependencies ?? {}).length || Object.keys(pkg.optionalDependencies ?? {}).length) {
    throw new Error(`${pkg.name} must not declare runtime dependencies`)
  }
  if (pkg.name === "@hibiki/hono") {
    const peers = Object.keys(pkg.peerDependencies ?? {}).sort().join(",")
    if (peers !== "@hibiki/core,hono") throw new Error("@hibiki/hono peers must be @hibiki/core and hono")
  }
}
