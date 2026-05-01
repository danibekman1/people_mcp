import { defineConfig } from "vitest/config"
import { resolve } from "path"

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    // jsdom is needed for React component tests. The Node-only lib/ tests
    // don't touch globals so a single env keeps the config minimal.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "lib/**/*.test.ts",
      "lib/**/__tests__/**/*.test.ts",
      "components/**/*.test.tsx",
      "components/**/__tests__/**/*.test.tsx",
    ],
  },
})
