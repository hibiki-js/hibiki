import { defineConfig } from "vitest/config"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@hibiki/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@hibiki/stripe": fileURLToPath(new URL("./packages/stripe/src/index.ts", import.meta.url)),
      "@hibiki/github": fileURLToPath(new URL("./packages/github/src/index.ts", import.meta.url)),
      "@hibiki/testing": fileURLToPath(new URL("./packages/testing/src/index.ts", import.meta.url)),
    },
  },
  test: { environment: "node" },
})
