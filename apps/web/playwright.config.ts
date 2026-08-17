import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.LIVE_BASE_URL || "https://www.matchreadtennis.com";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "e2e/live-checklist-results.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "live-chromium", use: { ...devices["Desktop Chrome"] } }],
});
