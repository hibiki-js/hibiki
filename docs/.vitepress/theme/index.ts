import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme"
import { h } from "vue"
import HomeHeroCode from "./HomeHeroCode.vue"
import "./custom.css"

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "home-hero-image": () => h(HomeHeroCode),
    })
  },
} satisfies Theme
