# Contributing to Hibiki

Thanks for your interest in contributing to Hibiki! Bug reports, focused fixes, documentation improvements, and new provider or integration work are welcome.

## Repository layout

This repository is a pnpm workspace:

- `packages/core` contains the provider-independent webhook router and shared types.
- `packages/stripe`, `packages/github`, and `packages/discord` implement provider-specific verification, parsing, and event types.
- `packages/hono` provides a Hono integration, and `packages/testing` provides webhook test utilities.
- `examples` contains integration examples, and `docs` contains the English and Japanese documentation.

## Development setup

You need Node.js 22 or later and pnpm 10.4.1. From the repository root, install dependencies:

```bash
pnpm install
```

## Making changes

- Keep Hibiki simple, lightweight, and fast. Include only functionality that serves a clear need; avoid unnecessary dependencies, abstractions, and bundled features.
- Keep provider-specific webhook behavior in that provider's package. Keep shared routing and types in `@hibiki-js/core`.
- Use Web Standards APIs such as `Request`, `Response`, and Web Crypto so packages work across supported runtimes.
- Keep runtime dependencies at zero.
- Verify signatures against the original raw request body before parsing the payload.
- Add or update tests for changed behavior. For public API or behavior changes, update the relevant English and Japanese documentation and examples as appropriate.

## AI-assisted contributions

AI tools are welcome. Review and understand any AI-generated changes before submitting them, and make sure you can explain how they work. Keep the code clear and straightforward so other contributors can understand and maintain it.

## Checks

Run the checks relevant to your change before opening a pull request. The full CI checks are:

```bash
pnpm check:dependencies
pnpm typecheck
pnpm check:examples
pnpm test:coverage
pnpm build
pnpm docs:build
```

## Pull requests

You can open a pull request directly. For substantial changes, open an Issue first to discuss the approach. In your pull request, describe what changed, link a related Issue when applicable, and list the checks you ran.
