import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  expect: { timeout: 8000 },
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5178',
    browserName: 'chromium',
    reducedMotion: 'no-preference',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5178 --strictPort',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: !process.env.CI,
  },
});
