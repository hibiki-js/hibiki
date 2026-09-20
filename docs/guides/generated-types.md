# Provider event types

v0.1 keeps a small curated event map in each provider package.

When event coverage grows, prefer this pipeline:

```text
Provider schema / OpenAPI
        ↓
scripts/generate-*-types.ts
        ↓
packages/<provider>/src/generated/*.ts (committed)
```

Rules:

- Generated files are committed
- No `postinstall` generation
- Generator tools stay in root `devDependencies` only
- Published packages still have zero runtime dependencies

Until a generator is needed, hand-written event maps in `packages/*/src/index.ts` are the source of truth.
