// Browser tests (npm run e2e). They run against a throwaway server with its own data folder (e2e/server.ts).
// Build the web app first (npm run build) and install the browser once (npx playwright install chromium).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://127.0.0.1:8199', locale: 'en-US', trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node e2e/server.ts', url: 'http://127.0.0.1:8199/', reuseExistingServer: false, timeout: 60_000 },
});
