---
layout: home

hero:
  name: Hibiki
  text: Type-safe webhooks for TypeScript
  tagline: Zero runtime dependencies. Built on Web Standards.
  image:
    src: /logo.png
    alt: Hibiki
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/hibiki-js/hibiki

features:
  - icon: 🛡️
    title: Signature-first
    details: Providers verify with Web Crypto before parsing, so handlers only see trusted payloads.
  - icon: 🧠
    title: Type-safe handlers
    details: Event names and payloads are inferred from the providers you register.
  - icon: 🪶
    title: Zero runtime deps
    details: Core and providers ship without Stripe SDK, Octokit, or other heavy runtimes.
  - icon: 🌐
    title: Web Standards
    details: Works with Request / Response on Node, Next.js, Hono, Cloudflare Workers, and more.
---
