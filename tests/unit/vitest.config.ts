// Vitest Configuration for Unit Tests

import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.git/**",
      "**/apps/**/node_modules/**",
      "**/packages/**/node_modules/**",
    ],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/"],
    },
    setupFiles: ["./tests/unit/setup.ts"],
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../../packages/core"),
      "@api": path.resolve(__dirname, "../../apps/api/src"),
    },
  },
});
