import assert from "node:assert/strict"
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { gzipSync, brotliCompressSync } from "node:zlib"
import { build } from "tsup"
import { environment, assertEnvironmentUnchanged } from "./environment.mjs"

const { values } = parseArgs({ options: { output: { type: "string" } } })
const directory = await mkdtemp(join(tmpdir(), "hibiki-size-"))
const measuredEnvironment = await environment()
const results = []
try {
  for (const fixture of ["core", "stripe-receive", "github-receive", "discord-receive", "discord-send"]) {
    await build({
      entry: [`benchmarks/fixtures/${fixture}.mjs`],
      outDir: directory, outExtension: () => ({ js: ".mjs" }),
      format: ["esm"], platform: "browser", target: "es2022",
      tsconfig: "benchmarks/tsconfig.json", noExternal: [/^@hibiki-js\//],
      minify: true, sourcemap: true, silent: true,
    })
    const file = join(directory, `${fixture}.mjs`)
    const map = JSON.parse(await readFile(`${file}.map`, "utf8"))
    assert.ok(map.sources.some(source => /packages\/.*\/dist\//.test(source)), "Must bundle built packages")
    assert.ok(!map.sources.some(source => /packages\/.*\/src\//.test(source)), "Source aliases must be disabled")
    // Exclude the external source-map link from distributed code size.
    const code = Buffer.from((await readFile(file, "utf8")).replace(/\n?\/\/# sourceMappingURL=.*\n?$/, ""))
    const result = { fixture, bytes: code.byteLength, gzipBytes: gzipSync(code, { level: 9 }).byteLength, brotliBytes: brotliCompressSync(code).byteLength }
    results.push(result)
    console.log(`${fixture.padEnd(16)} raw=${result.bytes} gzip=${result.gzipBytes} brotli=${result.brotliBytes} bytes`)
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
await assertEnvironmentUnchanged(measuredEnvironment)
if (values.output) await writeFile(values.output, JSON.stringify({ schemaVersion: 1, ...measuredEnvironment, results }, null, 2) + "\n")
