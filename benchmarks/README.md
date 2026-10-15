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

Operations are sequential with concurrency 1. This is not
HTTP server throughput or end-to-end delivery latency. Fixture preparation and
assertions can affect GC/scheduling; a difference between verify and handle is
not an isolated measurement of parsing or body copying.

The initial harness does not measure cold starts, concurrency, peak memory,
network I/O, streaming uploads or other runtimes. Do not infer cross-runtime
performance from Node.js results. Add targeted cases when investigating those
behaviors. Timing results have no CI pass/fail threshold because shared-runner
noise can exceed small optimizations.

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
