import { runSuite } from "./suite.ts"

if (typeof Bun !== "undefined") console.log(`Bun ${Bun.version}`)
else if (typeof Deno !== "undefined") console.log(`Deno ${Deno.version.deno}`)
else throw new Error("Run this entrypoint with Bun or Deno")

// Catch accidental source aliases or imports from a published registry version.
for (const name of ["core", "stripe", "github", "discord", "testing"]) {
  const resolved = import.meta.resolve(`@hibiki-js/${name}`)
  if (!resolved.endsWith(`/packages/${name}/dist/index.js`)) {
    throw new Error(`Expected local built package for ${name}, received ${resolved}`)
  }
}

const result = await runSuite()
console.log(`Passed ${result.passed}/${result.total} runtime compatibility cases`)
