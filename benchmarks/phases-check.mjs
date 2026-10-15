import assert from "node:assert/strict"
import { test } from "node:test"
import { createPhaseRecorder, instrumentCore, phases } from "./phase-instrumentation.mjs"

test("reject missing or ambiguous instrumentation anchors", () => {
  assert.throws(() => instrumentCore(""), /anchor must occur exactly once/)
  const anchor = "const rawBody = await readBody(request, this.options.maxBodyBytes);"
  assert.throws(() => instrumentCore(`${anchor}\n${anchor}`), /anchor must occur exactly once/)
})

test("record exclusive spans and residual; reset between requests", () => {
  let time = 0
  const recorder = createPhaseRecorder(() => time++)
  for (let request = 0; request < 2; request++) {
    for (const phase of phases) { recorder.mark(`${phase}:start`); recorder.mark(`${phase}:end`) }
    assert.deepEqual(recorder.finish(20), { bodyRead: 1, verify: 1, decodeParse: 1, storeClaim: 1, handler: 1, storeComplete: 1, other: 14 })
  }
})

test("reject skipped, repeated, reordered or non-additive spans", () => {
  for (const labels of [[], ["bodyRead:start", "bodyRead:end", "bodyRead:end"],
    phases.toReversed().flatMap(phase => [`${phase}:start`, `${phase}:end`])]) {
    const recorder = createPhaseRecorder()
    for (const label of labels) recorder.mark(label)
    assert.throws(() => recorder.finish(1), /phase boundary/)
  }
  let time = 0
  const recorder = createPhaseRecorder(() => time++)
  for (const phase of phases) { recorder.mark(`${phase}:start`); recorder.mark(`${phase}:end`) }
  assert.throws(() => recorder.finish(1), /Invalid other duration/)
})
