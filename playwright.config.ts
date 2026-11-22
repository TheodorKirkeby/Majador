import { defineConfig, devices } from '@playwright/test'

// End-to-end tests: the real app in a phone-sized Chromium, with Supabase
// replaced by an in-memory fake (tests/fake-backend.ts). Nothing leaves the
// machine and the real database is never touched. Run with `npm test`.
const PORT = 5199

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    ...devices['Pixel 7'],
    baseURL: `http://localhost:${PORT}`,
    locale: 'da-DK',
    timezoneId: 'Europe/Copenhagen',
    // A service worker would answer requests before the fake backend sees them.
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
