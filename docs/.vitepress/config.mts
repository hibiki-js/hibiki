import { defineConfig, type DefaultTheme } from "vitepress"

function nav(prefix = ""): DefaultTheme.NavItem[] {
  return [
    { text: prefix ? "ガイド" : "Guide", link: `${prefix}/guide/getting-started` },
    { text: prefix ? "プロバイダー" : "Providers", link: `${prefix}/providers/stripe` },
    { text: "Integrations", link: `${prefix}/integrations/hono` },
    { text: prefix ? "実践ガイド" : "Guides", link: `${prefix}/guides/nextjs-stripe` },
    { text: prefix ? "リファレンス" : "Reference", link: `${prefix}/reference/core` },
  ]
}

function sidebar(prefix = ""): DefaultTheme.Sidebar {
  const guideLabel = prefix ? "ガイド" : "Guide"
  const providersLabel = prefix ? "プロバイダー" : "Providers"
  const integrationsLabel = "Integrations"
  const guidesLabel = prefix ? "実践ガイド" : "Guides"
  const referenceLabel = prefix ? "リファレンス" : "Reference"

  return [
    {
      text: guideLabel,
      items: [
        { text: prefix ? "はじめに" : "Getting Started", link: `${prefix}/guide/getting-started` },
        { text: prefix ? "コンセプト" : "Concepts", link: `${prefix}/guide/concepts` },
        { text: prefix ? "エラー処理" : "Error Handling", link: `${prefix}/guide/error-handling` },
      ],
    },
    {
      text: providersLabel,
      items: [
        { text: "Stripe", link: `${prefix}/providers/stripe` },
        { text: "GitHub", link: `${prefix}/providers/github` },
        { text: "Discord", link: `${prefix}/providers/discord` },
      ],
    },
    {
      text: integrationsLabel,
      items: [{ text: "Hono", link: `${prefix}/integrations/hono` }],
    },
    {
      text: guidesLabel,
      items: [
        { text: "Next.js + Stripe", link: `${prefix}/guides/nextjs-stripe` },
        { text: "Hono + Stripe", link: `${prefix}/guides/hono-stripe` },
        { text: "Cloudflare + Stripe", link: `${prefix}/guides/cloudflare-stripe` },
        { text: prefix ? "テスト" : "Testing", link: `${prefix}/guides/testing` },
      ],
    },
    {
      text: referenceLabel,
      items: [
        { text: "@hibiki-js/core", link: `${prefix}/reference/core` },
        { text: "@hibiki-js/stripe", link: `${prefix}/reference/stripe` },
        { text: "@hibiki-js/github", link: `${prefix}/reference/github` },
        { text: "@hibiki-js/discord", link: `${prefix}/reference/discord` },
        { text: "@hibiki-js/hono", link: `${prefix}/reference/hono` },
        { text: "@hibiki-js/testing", link: `${prefix}/reference/testing` },
      ],
    },
  ]
}

export default defineConfig({
  title: "Hibiki",
  description: "Type-safe webhooks for TypeScript",
  // Published at https://hibiki-js.github.io (org root site)
  base: "/",
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: "https://hibiki-js.github.io",
  },
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/favicon.png" }],
    ["link", { rel: "apple-touch-icon", href: "/logo.png" }],
  ],
  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        logo: { src: "/logo.png", alt: "Hibiki" },
        nav: nav(),
        sidebar: sidebar(),
        outline: { label: "On this page" },
        docFooter: { prev: "Previous", next: "Next" },
        lastUpdated: { text: "Updated" },
        returnToTopLabel: "Return to top",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Appearance",
        lightModeSwitchTitle: "Switch to light theme",
        darkModeSwitchTitle: "Switch to dark theme",
        langMenuLabel: "Change language",
      },
    },
    ja: {
      label: "日本語",
      lang: "ja",
      link: "/ja/",
      description: "TypeScript 向けの型安全な Webhook フレームワーク",
      themeConfig: {
        logo: { src: "/logo.png", alt: "Hibiki" },
        nav: nav("/ja"),
        sidebar: sidebar("/ja"),
        outline: { label: "目次" },
        docFooter: { prev: "前へ", next: "次へ" },
        lastUpdated: { text: "最終更新" },
        returnToTopLabel: "ページ上部へ",
        sidebarMenuLabel: "メニュー",
        darkModeSwitchLabel: "外観",
        lightModeSwitchTitle: "ライトモードに切り替え",
        darkModeSwitchTitle: "ダークモードに切り替え",
        langMenuLabel: "言語を切り替える",
      },
      markdown: {
        container: {
          tipLabel: "ヒント",
          warningLabel: "注意",
          dangerLabel: "警告",
          infoLabel: "情報",
          detailsLabel: "詳細",
        },
        codeCopyButtonTitle: "コードをコピー",
      },
    },
  },
  themeConfig: {
    logo: { src: "/logo.png", alt: "Hibiki" },
    siteTitle: "Hibiki",
    socialLinks: [{ icon: "github", link: "https://github.com/hibiki-js/hibiki" }],
    search: { provider: "local" },
  },
})
