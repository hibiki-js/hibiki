import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { applicationMetrics } from "./source-metrics.mjs"

test("application metrics follow runtime imports and exclude unrelated verification code", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hibiki-source-metrics-"))
  try {
    await writeFile(join(dir, "app.ts"), "import type { Config } from './contract.js'\nimport { helper } from './helper.js'\nexport const app = helper()\n")
    await writeFile(join(dir, "helper.ts"), "import { Hibiki } from '@hibiki-js/core'\nexport const helper = () => new Hibiki()\n")
    await writeFile(join(dir, "contract.ts"), "export interface Config { secret: string }\n")
    await writeFile(join(dir, "verify.mjs"), "import { stripeRequest } from '@hibiki-js/testing'\n".repeat(100))
    const result = await applicationMetrics(dir)
    assert.deepEqual(result.files, ["app.ts", "helper.ts"])
    assert.equal(result.nonblankLines, 5)
    assert.deepEqual(result.imports, ["@hibiki-js/core"])
  } finally { await rm(dir, { recursive: true, force: true }) }
})
