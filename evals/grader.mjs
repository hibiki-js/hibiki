import assert from "node:assert/strict"
import { createHmac } from "node:crypto"

function request(provider, payload, secret, { timestamp = Math.floor(Date.now() / 1000), event = "issues", tamper = false, unsigned = false } = {}) {
  const body = JSON.stringify(payload)
  const headers = { "content-type": "application/json" }
  if (provider === "stripe") {
    if (!unsigned) headers["stripe-signature"] = `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`
  } else {
    headers["x-github-event"] = event
    if (!unsigned) headers["x-hub-signature-256"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  }
  return new Request(`https://eval.test/webhooks/${provider}`, { method: "POST", headers, body: tamper ? body + " " : body })
}

/** Hidden deterministic checks, independent of Hibiki/testing implementations. */
export async function grade(createApp, providers) {
  const checks = []
  const run = async (name, fn) => {
    try { await fn(); checks.push({ name, pass: true }) }
    catch (error) { checks.push({ name, pass: false, error: String(error.message).slice(0, 1000) }) }
  }
  const setup = (failing = false) => {
    const paid = [], issues = []
    const app = createApp({
      stripeSecret: "eval_stripe", githubSecret: "eval_github",
      onPaid: async input => { if (failing) throw new Error("callback failed"); paid.push(input) },
      onIssue: async input => { if (failing) throw new Error("callback failed"); issues.push(input) },
    })
    return { app, paid, issues }
  }
  await run("health", async () => {
    const response = await setup().app.fetch(new Request("https://eval.test/health"))
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true })
  })
  await run("unknown-path", async () => assert.equal((await setup().app.fetch(new Request("https://eval.test/missing"))).status, 404))
  for (const provider of providers) {
    const payload = provider === "stripe"
      ? { id: "evt_eval", type: "checkout.session.completed", data: { object: { id: "cs_eval", object: "checkout.session", payment_status: "paid", amount_total: 4200, metadata: { order_id: "order_eval" } } } }
      : { action: "opened", issue: { number: 42, title: "Billing" }, repository: { full_name: "acme/app" } }
    const secret = `eval_${provider}`
    const expected = provider === "stripe" ? { sessionId: "cs_eval", orderId: "order_eval", amount: 4200 } : { repository: "acme/app", number: 42, title: "Billing" }
    await run(`${provider}:side-effect`, async () => {
      const { app, paid, issues } = setup()
      const response = await app.fetch(request(provider, payload, secret))
      assert.ok(response.status >= 200 && response.status < 300)
      assert.deepEqual(provider === "stripe" ? paid : issues, [expected])
      assert.deepEqual(provider === "stripe" ? issues : paid, [])
    })
    for (const [name, signingSecret, options] of [
      ["wrong-secret", "incorrect", {}], ["tampered", secret, { tamper: true }], ["missing-signature", secret, { unsigned: true }],
      ...(provider === "stripe" ? [["expired", secret, { timestamp: Math.floor(Date.now() / 1000) - 600 }]] : []),
    ]) {
      await run(`${provider}:${name}`, async () => {
        const { app, paid, issues } = setup()
        const response = await app.fetch(request(provider, payload, signingSecret, options))
        assert.ok(response.status >= 400 && response.status < 500)
        assert.deepEqual(paid, []); assert.deepEqual(issues, [])
      })
    }
    await run(`${provider}:ignored-event`, async () => {
      const { app, paid, issues } = setup()
      const ignored = provider === "stripe" ? { ...payload, type: "invoice.created" } : { ...payload, action: "closed" }
      const response = await app.fetch(request(provider, ignored, secret))
      assert.ok(response.status >= 200 && response.status < 300)
      assert.deepEqual(paid, []); assert.deepEqual(issues, [])
    })
    await run(`${provider}:wrong-method`, async () => {
      const { app, paid, issues } = setup()
      const signed = request(provider, payload, secret)
      const response = await app.fetch(new Request(signed, { method: "PUT" }))
      assert.ok(response.status >= 400 && response.status < 500)
      assert.deepEqual(paid, []); assert.deepEqual(issues, [])
    })
    if (provider === "github") {
      await run("github:wrong-header-event", async () => {
        const { app, issues } = setup()
        const response = await app.fetch(request(provider, payload, secret, { event: "pull_request" }))
        assert.ok(response.status >= 200 && response.status < 300); assert.deepEqual(issues, [])
      })
      await run("github:non-json", async () => {
        const { app, issues } = setup()
        const signed = request(provider, payload, secret)
        const headers = new Headers(signed.headers); headers.set("content-type", "application/x-www-form-urlencoded")
        const response = await app.fetch(new Request(signed, { headers }))
        assert.ok(response.status >= 400 && response.status < 500); assert.deepEqual(issues, [])
      })
    }
    if (provider === "stripe") await run("stripe:unpaid", async () => {
      const { app, paid } = setup()
      const response = await app.fetch(request(provider, { ...payload, data: { object: { ...payload.data.object, payment_status: "unpaid" } } }, secret))
      assert.ok(response.status >= 200 && response.status < 300); assert.deepEqual(paid, [])
    })
    await run(`${provider}:callback-failure`, async () => {
      const response = await setup(true).app.fetch(request(provider, payload, secret))
      assert.ok(response.status >= 500 && response.status < 600)
    })
    await run(`${provider}:await-callback`, async () => {
      let called = false, complete = false, release
      const pending = new Promise(resolve => { release = resolve })
      const callback = async () => { called = true; await pending; complete = true }
      const app = createApp({ stripeSecret: "eval_stripe", githubSecret: "eval_github", onPaid: callback, onIssue: callback })
      let returned = false
      const response = Promise.resolve(app.fetch(request(provider, payload, secret))).then(value => { returned = true; return value })
      try {
        for (let i = 0; i < 20 && !called && !returned; i++) await new Promise(resolve => setTimeout(resolve, 5))
        assert.ok(called, "callback was not called"); assert.equal(returned, false, "response preceded callback completion")
      } finally { release(); await response }
      assert.equal(complete, true)
    })
  }
  return { success: checks.every(check => check.pass), checks }
}
