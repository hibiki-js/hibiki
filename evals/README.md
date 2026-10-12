# Hibiki agent evaluations

Measure selection and implementation separately. Model runs are opt-in; ordinary CI runs only deterministic self-checks. This harness does not contact a model API itself and adds no agent SDK dependency.

[The October 12 subagent study](./reports/2026-10-12-subagents.md) records 18 real-agent trials, including the limitations of controller timing and one underspecified grading criterion. Subagents were dispatched by the conversation controller through `subagent-bridge.mjs`; it is a queue/completion bridge, not a model runner on its own.

## Suites and tasks

- `adoption`: neutral prompts; no framework is initially installed with the default `--fixture empty`. `--fixture hono` starts from a Hono health endpoint. No Hibiki name or dependency is supplied with `--context none`. Record declared dependencies and runtime imports separately; a static import is a diagnostic, not proof that the library handled the request. Count successful outputs separately from imports. Packages an agent installs in this suite come from the registry, not the local candidate.
- `value`: identical behavioral requirements with `--variant raw`, `sdk`, or `hibiki`. Raw uses Web/Node crypto, SDK uses Stripe 23.0.0 and @octokit/webhooks 14.2.0, and Hibiki uses locally built/packed packages. Version changes require a new baseline. Do not compare this suite's prompts to adoption/practical.
- `practical`: Hibiki packages are preinstalled. Compare `--context none`, `docs`, and `skill`, or before/after library implementations.

Tasks are `stripe-billing`, `github-existing`, and `multi-provider-change`. Value/practical begin with a Hono health endpoint; all fixtures include the same TypeScript compiler and Node type definitions. The last task has two change requests in one workspace and session; each stage is graded, and overall success requires both stages to pass. Use an adapter that actually resumes the session to measure conversational continuity. Without that, the result measures sequential workspace edits only.

All tasks export the same `createApp(Config)` interface. Grading exercises `fetch()` and injected business callbacks, independent of a framework. It checks health, unknown routes, valid side effects, invalid/missing/tampered signatures, Stripe expiry, ignored events, unpaid sessions and awaited/failing callbacks. The grader is outside the agent workspace and is not included in prompts. The local runner does not provide filesystem isolation: use a sandboxed agent adapter for adversarial or strongly isolated evaluation. This also is not a complete webhook security audit.

## Agent adapter

Pass `--agent-command` as a JSON argv array; execution uses no shell. Placeholders are `{workspace}`, `{prompt}`, `{session}`, `{metrics}`. The same values plus `HIBIKI_EVAL_STEP` are in `HIBIKI_EVAL_*` environment variables. The adapter must:

1. Read the prompt file, run the chosen agent in the workspace and wait for completion.
2. Start a fresh conversation for each session ID and resume it for later steps.
3. Optionally write actual per-step token usage as `{"inputTokens":123,"outputTokens":45}` to the metrics path. Missing usage is reported as null, never zero.
4. Return nonzero on agent failure. The runner supplies process timeouts; only descendants of its own process group are terminated.

The adapter is specific to your agent installation. Set the actual model and harness/version labels; do not use labels as a substitute for configuring the adapter.

The included `claude-agent.mjs` adapter uses Claude Code's [print/JSON interface](https://code.claude.com/docs/en/headless) with `--session-id` then `--resume`. It configures the model from `--model`, records per-invocation usage including cache input, and uses `--safe-mode` to avoid host customizations. Docs/Skill treatment is explicitly appended to the system prompt; this tests loaded guidance, not automatic skill discovery. It retains normal authentication and permission checks, restricts built-in tools to coding/retrieval tools, and pre-approves those tools for the temporary workspace. It defaults to a $1 estimated per-step cap (override with `HIBIKI_EVAL_CLAUDE_BUDGET_USD`) and 40 turns. Run this only when you intend to make real, potentially billed agent calls. Record the installed CLI version in `--harness`.

```bash
pnpm eval:agents --suite practical --task multi-provider-change --runs 3 \
  --agent-command '["node","/absolute/path/to/hibiki/evals/claude-agent.mjs"]' \
  --model your-exact-model-id --harness claude-code-your-version \
  --report evals/results/claude-baseline.json
```

```bash
# Inspect the exact task without installing packages or invoking an agent.
pnpm eval:agents --dry-run --suite adoption --task stripe-billing

# Replace /absolute/path/agent-adapter.mjs with your configured agent adapter.
pnpm eval:agents --suite practical --task stripe-billing --runs 3 \
  --agent-command '["node","/absolute/path/agent-adapter.mjs","{prompt}","{workspace}","{session}"]' \
  --model your-model-id --harness your-agent-and-version \
  --label baseline --report evals/results/baseline.json

pnpm eval:compare evals/results/baseline.json evals/results/candidate.json
```

`--keep` preserves agent logs, metrics, packed packages and workspaces in the printed temporary directory. Reports do not include raw agent transcripts. Agent duration excludes dependency installation and grading. Reports include prompts/hashes, fixture/grader/context hashes, compiler/Node version, commit, package content hashes, initial/final dependency-lock hashes, per-step checks, timeout/exit status, tokens and implementation line counts. Compare refuses changed task/prompt/fixture/grader/model/harness/runtime/compiler/time limits. Comparisons intentionally allow a library or context treatment change. Value comparisons across variants use the base task prompt hash, since the dependency policy is the treatment, and require identical context.

Start with three runs to inspect failure causes, then increase repetitions for conclusions. Compare success counts first; report cost on all runs and successful runs separately. Small samples are exploratory. Publish the exact conditions with any result.

Report schema v2 counts runtime imports and implementation lines only in application sources reachable from `app.ts`, excluding the fixture contract and standalone verification scripts. `projectSourceImports` and `projectSourceLines` preserve the broader diagnostics. Old schema-v1 reports are retained; comparisons refuse mixed schema versions. The subagent study re-counted application sources independently without rewriting the original reports.

## Deterministic validation

```bash
pnpm check:evals
# End-to-end runner check: this adapter writes a known implementation; it is NOT an AI result.
pnpm eval:agents --suite practical --task multi-provider-change --runs 1 \
  --agent-command '["node","/absolute/path/to/hibiki/evals/reference-agent.mjs"]' \
  --model deterministic-fixture --harness reference-agent-v1 \
  --report evals/results/self-check.json
```
