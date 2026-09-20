import { defineConfig } from "vitest/config"
import { fileURLToPath, URL } from "node:url"

export default defineConfig({
  resolve: {
    alias: {
      "@hibiki-js/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@hibiki-js/stripe": fileURLToPath(new URL("./packages/stripe/src/index.ts", import.meta.url)),
      "@hibiki-js/github": fileURLToPath(new URL("./packages/github/src/index.ts", import.meta.url)),
      "@hibiki-js/testing": fileURLToPath(new URL("./packages/testing/src/index.ts", import.meta.url)),
    },
  },
  test: { environment: "node" },
})
