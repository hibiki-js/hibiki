import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { build } from "tsup"
import { Miniflare } from "miniflare"

await build({
  entry: ["tests/runtime/worker.ts"],
  outDir: "tests/runtime/dist",
  format: ["esm"],
  outExtension: () => ({ js: ".mjs" }),
  platform: "browser",
  target: "es2022",
  tsconfig: "tests/runtime/tsconfig.json",
  noExternal: [/^@hibiki-js\//],
  sourcemap: true,
  clean: true,
})

const { version } = createRequire(import.meta.resolve("miniflare"))("workerd")
console.log(`workerd ${version}`)

const worker = new Miniflare({
  modules: true,
  scriptPath: "tests/runtime/dist/worker.mjs",
  compatibilityDate: "2026-07-30",
  // Deliberately omit nodejs_compat: Hibiki must use Web Standards alone.
  compatibilityFlags: [],
})
try {
  const response = await worker.dispatchFetch("https://hibiki.test/runtime-tests")
  const body = await response.text()
  assert.equal(response.status, 200, body)
  const result = JSON.parse(body)
  assert.ok(result.total > 0, "No runtime cases executed")
  assert.equal(result.passed, result.total, "Incomplete runtime suite")
  assert.equal(result.names.length, result.total)
  assert.equal(new Set(result.names).size, result.total)
  for (const provider of ["Core", "Stripe", "GitHub", "Discord"]) {
    assert.ok(result.names.some(name => name.startsWith(`${provider}:`)), `Missing ${provider} cases`)
  }
  console.log(`workerd: passed ${result.passed}/${result.total} runtime compatibility cases`)
} finally {
  await worker.dispose()
}
