import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { cpus, platform, arch } from "node:os"

export async function environment() {
  const hash = async path => createHash("sha256").update(await readFile(path)).digest("hex")
  const builtPackageSha256 = {}
  for (const name of ["core", "stripe", "github", "discord"]) {
    builtPackageSha256[name] = await hash(`packages/${name}/dist/index.js`)
  }
  return {
    timestamp: new Date().toISOString(),
    commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0,
    runtime: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model,
    lockfileSha256: await hash("pnpm-lock.yaml"), builtPackageSha256,
  }
}

/** Refuse to attribute measurements to code that changed during the run. */
export async function assertEnvironmentUnchanged(before) {
  const after = await environment()
  for (const field of ["commit", "dirty", "lockfileSha256", "builtPackageSha256"]) {
    assert.deepEqual(after[field], before[field], `${field} changed during measurement; rebuild and rerun`)
  }
}
