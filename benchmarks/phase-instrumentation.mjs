import assert from "node:assert/strict"
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

export const phases = ["bodyRead", "verify", "decodeParse", "storeClaim", "handler", "storeComplete"]

// Modify only an ephemeral copy of built Core. Exact, single-match anchors make
// upstream build/flow changes fail closed instead of silently omitting a phase.
export function instrumentCore(source) {
  const span = (phase, statement) => `__phaseMark("${phase}:start");\n${statement}\n__phaseMark("${phase}:end");`
  const edits = [
    ["const rawBody = await readBody(request, this.options.maxBodyBytes);", span("bodyRead", "const rawBody = await readBody(request, this.options.maxBodyBytes);")],
    ["await provider.verify({ rawBody, headers: request.headers, request });", span("verify", "await provider.verify({ rawBody, headers: request.headers, request });")],
    ["const text = decoder.decode(rawBody);", '__phaseMark("decodeParse:start");\nconst text = decoder.decode(rawBody);'],
    ["parsed = await provider.parse({ rawBody, text, headers: request.headers, request });", 'parsed = await provider.parse({ rawBody, text, headers: request.headers, request });\n__phaseMark("decodeParse:end");'],
    ["acquired = await this.idempotencyStore.claim(key);", span("storeClaim", "acquired = await this.idempotencyStore.claim(key);")],
    ["if (this.middlewares.length === 0) result = await handler(context);", `if (this.middlewares.length === 0) { ${span("handler", "result = await handler(context);")} }`],
    ["if (response.ok) await this.idempotencyStore.complete(owned.key, owned.token);", `if (response.ok) { ${span("storeComplete", "await this.idempotencyStore.complete(owned.key, owned.token);")} }`],
  ]
  for (const [anchor, replacement] of edits) {
    assert.equal(source.split(anchor).length - 1, 1, `Phase anchor must occur exactly once: ${anchor}`)
    source = source.replace(anchor, () => replacement)
  }
  return `let __phaseMark;\nexport function setPhaseRecorder(record) { __phaseMark = record }\n${source}`
}

export async function loadInstrumentedCore() {
  const source = await readFile(new URL("../packages/core/dist/index.js", import.meta.url), "utf8")
  const instrumented = instrumentCore(source)
  const directory = await mkdtemp(join(tmpdir(), "hibiki-phases-"))
  try {
    const path = join(directory, "core.mjs")
    await writeFile(path, instrumented)
    const module = await import(pathToFileURL(path).href)
    return { ...module, dispose: () => rm(directory, { recursive: true, force: true }) }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

/** One sequential, successful dispatch must visit every boundary exactly once. */
export function createPhaseRecorder(clock = () => performance.now()) {
  const expected = phases.flatMap(phase => [`${phase}:start`, `${phase}:end`])
  const labels = new Array(expected.length)
  const timestamps = new Float64Array(expected.length)
  let count = 0
  return {
    mark(label) {
      timestamps[count] = clock()
      labels[count++] = label
    },
    finish(totalMs) {
      const recorded = count
      count = 0
      assert.equal(recorded, expected.length, "Missing or repeated phase boundary")
      assert.deepEqual(labels, expected, "Out-of-order phase boundary")
      const times = Object.fromEntries(phases.map((phase, index) => [phase, timestamps[index * 2 + 1] - timestamps[index * 2]]))
      times.other = totalMs - Object.values(times).reduce((sum, value) => sum + value, 0)
      for (const [phase, value] of Object.entries(times)) assert.ok(Number.isFinite(value) && value >= 0, `Invalid ${phase} duration`)
      return times
    },
  }
}
