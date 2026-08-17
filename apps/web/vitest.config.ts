import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic"
    }
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.{ts,tsx}"],
    coverage: {
      include: [
        "src/components/evidence-instrument.tsx",
        "src/components/evidence-rail.tsx",
        "src/components/site-footer.tsx",
        "src/components/site-header.tsx",
        "src/lib/landing-receipt.ts",
        "src/lib/publish-receipt.ts",
        "src/server/api-errors.ts",
        "src/server/evidence-workflow.ts",
        "src/server/public-receipt.ts"
      ],
      provider: "v8",
      reporter: ["text", "json-summary"],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 85,
        statements: 85
      }
    },
    globals: true,
    restoreMocks: true
  }
});
