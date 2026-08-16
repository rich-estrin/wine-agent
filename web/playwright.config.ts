import { defineConfig, devices } from '@playwright/test';

const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5199);
const API_PORT = Number(process.env.E2E_API_PORT || 3101);
// localhost, not 127.0.0.1: Vite binds the dev server to IPv6 loopback ([::1])
// by default, so an IPv4-literal health probe never connects and the webServer
// times out. `localhost` resolves to whichever family Vite actually bound.
const baseURL = `http://localhost:${WEB_PORT}`;

// Some environments ship a pre-installed Chromium that doesn't match the build
// this Playwright version expects. Point at it explicitly rather than baking a
// machine-specific path into the repo; on a normal machine `npx playwright
// install chromium` is all that's needed and this stays unset.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: './e2e',
  // The whole suite runs against static fixture data, so nothing here depends
  // on WordPress, a CSV export, or credentials.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },

  projects: [
    {
      name: 'desktop',
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions: executablePath ? { executablePath } : {} },
    },
    {
      name: 'mobile',
      testIgnore: /screenshots\.spec\.ts/,
      use: { ...devices['Pixel 7'], launchOptions: executablePath ? { executablePath } : {} },
    },
    {
      // Opt-in: `npm run screenshots`. Writes images for eyeballing rather than
      // comparing pixels, which would differ between this machine and CI.
      name: 'screenshots',
      testMatch: /screenshots\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, launchOptions: executablePath ? { executablePath } : {} },
    },
  ],

  webServer: [
    {
      command: `WINE_FIXTURE=fixtures/wines.json PORT=${API_PORT} npx tsx server/index.ts`,
      url: `http://127.0.0.1:${API_PORT}/api/meta`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
    },
    {
      command: `API_PROXY_TARGET=http://127.0.0.1:${API_PORT} npx vite --port ${WEB_PORT} --strictPort`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: 'ignore',
    },
  ],
});
