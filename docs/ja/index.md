---
layout: home

hero:
  name: Hibiki
  text: TypeScript 向けの型安全な Webhook
  tagline: ランタイム依存ゼロ。Web Standards ベース。
  image:
    src: /logo.png
    alt: Hibiki
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide/getting-started
    - theme: alt
      text: GitHub で見る
      link: https://github.com/hibiki-js/hibiki

features:
  - icon: 🛡️
    title: 署名を先に検証
    details: Web Crypto で署名を確認してからパースするので、ハンドラは信頼できるペイロードだけを受け取ります。
  - icon: 🧠
    title: 型安全なハンドラ
    details: 登録したプロバイダーからイベント名とペイロード型が推論されます。
  - icon: 🪶
    title: ランタイム依存ゼロ
    details: Core / プロバイダーは Stripe SDK や Octokit などの重い依存を持ちません。
  - icon: 🌐
    title: Web Standards
    details: Request / Response ベースなので Node・Next.js・Hono・Cloudflare Workers などで動きます。
---
