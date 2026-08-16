import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5_000 },
  forbidOnly: Boolean(process.env.CI),
  outputDir: "/tmp/proofrail-playwright-results",
  projects: [
    {
      name: "desktop-chromium",
      use: { viewport: { height: 1_000, width: 1_440 } }
    },
    {
      name: "mobile-chromium",
      use: { viewport: { height: 844, width: 390 } }
    }
  ],
  reporter: "list",
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    colorScheme: "dark",
    locale: "en-GB",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm start --hostname 127.0.0.1 --port 3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:3100"
  },
  workers: 1
});
