import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { cpus } from "node:os"
import { parseArgs } from "node:util"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { environment, assertEnvironmentUnchanged } from "./environment.mjs"
const { values } = parseArgs({
  options: { baseline: { type: "string" }, output: { type: "string" } },
})
assert.ok(
  values.baseline,
  "Pass --baseline PATH to a separately built checkout",
)
const measuredEnvironment = await environment()
const paths = [values.baseline, process.cwd()].map((root) =>
  resolve(root, "packages/discord/dist/index.js"),
)
const variants = [],
  hashes = []
for (const p of paths) {
  variants.push(await import(pathToFileURL(p).href))
  hashes.push(
    createHash("sha256")
      .update(await readFile(p))
      .digest("hex"),
  )
}
const results = [],
  cases = []
for (const cold of [false, true])
  for (const wait of ["default", true, false])
    for (const complex of [false, true]) cases.push({ cold, wait, complex })
for (const wait of [true, false])
  cases.push({
    cold: false,
    wait,
    complex: true,
    components: true,
    thread: true,
  })
for (const c of cases) {
  const samples = [[], []],
    captured = [],
    counts = [0, 0],
    constructors = []
  const url =
    "https://discord.com/api/webhooks/123/token" +
    (c.complex
      ? "?wait=false&thread_id=default&with_components=false&foo=a%20b&wait=true"
      : "")
  for (let v = 0; v < 2; v++)
    constructors[v] = () =>
      variants[v].createDiscordWebhook(url, {
        fetch: async (input, init) => {
          const wait = input.searchParams.get("wait") === "true"
          captured[v] = {
            url: String(input),
            redirect: init.redirect,
            body: init.body,
            headers: init.headers,
          }
          counts[v]++
          return wait
            ? Response.json({
                id: "message",
                channel_id: "channel",
                content: "hello",
              })
            : new Response(null, { status: 204 })
        },
      })
  const senders = constructors.map((make) => make()),
    payload = {
      content: "hello",
      ...(c.components ? { components: [{ type: 1 }] } : {}),
    },
    options = { wait: c.wait, ...(c.thread ? { threadId: "override" } : {}) }
  for (let i = 0; i < 2500; i++) {
    const outputs = []
    for (const v of i % 2 ? [1, 0] : [0, 1]) {
      const start = performance.now(),
        result = await (c.cold ? constructors[v]() : senders[v]).send(
          payload,
          c.wait === "default" ? undefined : options,
        ),
        elapsed = performance.now() - start
      if (i >= 500) samples[v].push(elapsed)
      outputs[v] = result
    }
    assert.deepEqual(captured[1], captured[0])
    assert.deepEqual(outputs[1], outputs[0])
    assert.equal(
      new URL(captured[0].url).searchParams.get("wait"),
      String(c.wait === "default" ? true : c.wait),
    )
    assert.equal(captured[0].body, JSON.stringify(payload))
  }
  assert.deepEqual(counts, [2500, 2500])
  const stats = samples.map((s) => {
    s.sort((a, b) => a - b)
    return {
      p50Us: s[999] * 1000,
      p95Us: s[1899] * 1000,
      meanUs: (s.reduce((a, b) => a + b) * 1000) / s.length,
    }
  })
  const r = { ...c, baseline: stats[0], candidate: stats[1] }
  results.push(r)
  console.log(JSON.stringify(r))
}
await assertEnvironmentUnchanged(measuredEnvironment)
if (values.output)
  await writeFile(
    values.output,
    JSON.stringify(
      {
        ...measuredEnvironment,
        runtime: process.version,
        cpu: cpus()[0]?.model,
        iterations: 2000,
        warmup: 500,
        concurrency: 1,
        hashes,
        results,
      },
      null,
      2,
    ) + "\n",
  )
