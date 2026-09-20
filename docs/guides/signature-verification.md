# Signature verification

Hibiki verifies signatures before parsing and before handlers run.

- Raw body bytes are taken from a cloned `Request`
- Verification uses Web Crypto (`crypto.subtle`)
- Secrets are passed explicitly by the caller; Hibiki never reads env vars itself
- Internal crypto details are not returned in HTTP responses

Provider packages follow the provider's official webhook signature scheme. See the Stripe and GitHub provider docs for event coverage.
