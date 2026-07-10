import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Written by `e2e/auth.setup.ts`; gitignored — it holds a real session. */
const OWNER_STATE = "e2e/.auth/owner.json";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    // Signs in as the owner once and saves cookies; the rest depend on it, so
    // /feed, /sources and /settings can finally be exercised behind the gate.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 13"], storageState: OWNER_STATE },
      dependencies: ["setup"],
    },
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"], storageState: OWNER_STATE },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    // A PRODUCTION server, not `next dev`. Under Turbopack dev the HMR websocket
    // fails in headless Chromium and the client never hydrates, so every
    // interaction test silently "fails" against code that is actually fine.
    // Building first costs ~30s and makes these tests mean something.
    command: "npm run build && npm run start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
});
