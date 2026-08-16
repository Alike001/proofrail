import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 95,
        functions: 100,
        lines: 100,
        statements: 100
      }
    },
    globals: true,
    restoreMocks: true
  }
});
