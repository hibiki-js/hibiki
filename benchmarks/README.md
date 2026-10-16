# Performance baselines

Measure local built ESM packages before changing webhook handling. These commands
add no dependencies and do not call external services.

```sh
pnpm install --frozen-lockfile
pnpm build
mkdir -p benchmarks/results
pnpm bench --output=benchmarks/results/timing.json
pnpm bench:size --output=benchmarks/results/size.json
```

Use the same exact Node.js version, hardware and idle machine for comparisons.
The initial reference runtime is Node.js 22.23.3. Run each revision at least three
times, alternating their order, and compare medians across runs. Keep the JSON
reports with the experiment; machine-specific results are not committed.

## Core rejection paths

Build this checkout and a separate baseline checkout with the same Node version
and lockfile, then run:

```sh
node benchmarks/rejections.mjs --baseline /path/to/baseline --output benchmarks/results/rejections.json
```

The eight cases cover missing providers, signed requests with rejected content
types, parse failures, strict unsupported events, pending claims, full stores,
failed completion storage, and invalid signatures as an unchanged control.
Each case alternates versions for 500 warmup and 1,500 measured operations.
Small fixtures are signed and Requests constructed outside timing. Status,
error body, handler counts and pending ownership are checked. Reports include
p50/p95/mean microseconds and hashes of built Core modules. Use the existing
normal webhook benchmark as well; faster rejection does not imply faster
successful dispatch. Run comparisons at least three times.

## Timing

`pnpm bench` defaults to 50 warmup operations and 500 measured operations per
case. Override with `--warmup=100 --iterations=1000`. Iterations must be 1–5000;
warmup must be 0–1000. Invalid flags, failed verification, unexpected status codes
or missing handler calls terminate the command with a nonzero exit status.

The 18 cases cover Stripe and GitHub HMAC-SHA256 and Discord Ed25519 at exact
UTF-8 JSON body sizes of 1, 10 and 100 KiB:

- `verify`: the provider's signature verification against pre-encoded bytes.
- `handle`: Core body reading, verification, decoding, parsing, dispatch, the
  default in-memory idempotency store where an authenticated ID exists, a small
  handler, and Response creation. Each request must execute its handler.

Signing, key generation, application setup, and Request construction are outside
the timed region. Inputs are prepared one at a time to bound fixture memory.
Stripe and Discord use unique signed IDs, avoiding the completed-event shortcut.
GitHub issue IDs are payload fields, not delivery IDs used for deduplication.
The handler returns an empty 204 Response; it performs no application I/O.

Reports include mean, p50, p95 and p99 operation latency in milliseconds and
`opsPerSecond` (1000 / mean latency), plus runtime, CPU, platform, commit and dirty
working-tree state, and SHA-256 hashes of the lockfile and built packages.
Metadata is captured before measurement. If the commit, dirty state, lockfile
or built-package hashes change before completion, the command fails without
writing a report. Rebuild and rerun after making changes.

For comparisons, build a separate baseline checkout with the same lockfile and
fixtures, then alternate baseline and candidate for each operation:

```sh
node benchmarks/compare.mjs --baseline /path/to/baseline --output benchmarks/results/comparison.json
```

This uses the same 18 cases with 500 warmup and 1,500 measured operations per
version by default. `--warmup` and `--iterations` accept the same bounds as
`pnpm bench`. Both builds' hashes are checked before writing the report. Run at
least three times and compare medians across runs; alternating does not remove
background load or establish a speed improvement from small timing differences.

Operations are sequential with concurrency 1. This is not
HTTP server throughput or end-to-end delivery latency. Fixture preparation and
assertions can affect GC/scheduling; a difference between verify and handle is
not an isolated measurement of parsing or body copying.

The initial harness does not measure cold starts, concurrency, peak memory,
network I/O, streaming uploads or other runtimes. Do not infer cross-runtime
performance from Node.js results. Add targeted cases when investigating those
behaviors. Timing results have no CI pass/fail threshold because shared-runner
noise can exceed small optimizations.

## Idempotency expiry bursts

Build the current checkout and a separate baseline checkout, then run:

```sh
node benchmarks/idempotency.mjs --baseline /path/to/baseline --output benchmarks/results/idempotency.json
```

The benchmark alternates versions for 30 independent expiry bursts at 0, 1,000
and 10,000 completed IDs. Setup is outside timing; an explicit clock advance
makes all completed IDs expire together. It reports the first claim and the
entire cleanup window, including the same subsequent claims for both versions.
Steady new/released, pending and completed claims use 100 batches of 1,000
operations. Assertions check claim results. Reports record p50/p95 microseconds,
Node version, CPU and SHA-256 of both built Core modules. Compare at least three
runs; burst latency reductions do not imply higher overall throughput.

Completion-only, claim-and-complete, and expiry-churn cases also use 100 batches
of 1,000 operations. Each batch uses a fresh store; completion-only setup claims
IDs outside timing. Churn pre-populates and expires 1,000 completed IDs before
timing their renewal and completion. All IDs must finish in the completed state.

To compare retained memory, use the same built checkouts:

```sh
node benchmarks/idempotency-memory.mjs --baseline /path/to/baseline --output benchmarks/results/idempotency-memory.json
```

This launches five isolated Node processes per version and scenario, alternating
version order. Each child uses `--expose-gc` and measures the heap delta after
four GC cycles on separate event-loop turns. Common keys are retained before the
initial measurement. Cases cover 1,000 empty stores, 10,000 pending/completed
IDs, a fully drained store, and 10 rounds of expiry and renewal of 10,000 IDs.
Stores remain reachable through the final GC. The delta includes runtime code
and bookkeeping initialized during the operation; it measures retained JS heap,
not peak memory, total allocations or process RSS. Both tools check built Core
hashes again before writing their reports.

## Bundle size

`pnpm bench:size` reuses tsup to bundle seven browser-targeted ES2022 ESM fixtures:
Core alone, Core + each receiving provider, and each provider sending alone. It disables
source aliases and checks source maps to ensure it measures built packages.
Unused exports can be removed normally by the bundler. The report includes
minified bytes, gzip level 9 bytes and Brotli bytes, excluding source maps and
their URL comments. Compression is synchronous and outside the latency benchmark.
Build artifacts use a temporary directory and are removed after measurement.

These are consumer bundle sizes, not npm tarball or installed dependency sizes.
Compare with the same lockfile, build options and Node.js version.

Core and the receiving-provider packages use `--minify-syntax` to reduce published
JavaScript while retaining readable identifiers and pure annotations. Check both
published artifacts (`npm pack --json --ignore-scripts` in each package) and these
consumer fixtures when changing build flags. Whitespace/full minification can
remove pure annotations; syntax minification can inline annotated IIFEs. Either
can retain unused event catalogs in sender-only bundles. GitHub's event catalog
annotates `Object.freeze` and `concat` separately to survive syntax minification.

## Discord sender URL normalization

Build this checkout and a separate baseline checkout, then run:

```sh
node benchmarks/discord-send.mjs --baseline /path/to/baseline --output benchmarks/results/discord-send.json
```

Fourteen cases cover reused clients and create-and-send calls, omitted/default,
true and false wait options, plain URLs and existing/duplicate query parameters,
and component/thread overrides. Each alternates versions for 500 warmup and
2,000 measured sends. A local fetch implementation returns fresh JSON or 204
Responses; there is no external network traffic. URL strings, payloads, headers,
redirect modes, returned messages and fetch counts are compared. Reports include
p50/p95/mean microseconds, environment and built-code hashes. Compare three runs.
Network latency, Discord rate limits and server throughput are not measured.

## Automated smoke checks

```sh
pnpm bench --iterations=3 --warmup=1
pnpm bench:size
```

Use a small iteration count to validate the harness, not to draw performance
conclusions. Full measurements are intentionally opt-in and do not lengthen the
existing pull-request CI.

## Hex encoding in complete operations

Build the current checkout and a separate baseline checkout, then run:

```sh
node benchmarks/encoding.mjs --baseline /path/to/baseline --output benchmarks/results/encoding.json
```

Each case alternates baseline and current built packages, with 500 warmup and
1,000 measured operations per version. It measures Testing Request generation,
Stripe/GitHub senders with a local fetch replacement, sender-to-Core delivery,
and GitHub parsing and complete receiving at 1 and 100 KiB. A Unicode 100 KiB
Testing-to-Core case also covers UTF-8 bodies. Request generation includes
serialization and signing; receiver-only timing excludes request signing and
construction. Both versions use the current checkout's Core dispatcher.
Response codes, handler counts, signatures, bodies and parsed IDs are checked.
No external HTTP requests are made. Reports include p50/p95/mean microseconds
and hashes of the compared built packages. Run three times on an idle machine.
