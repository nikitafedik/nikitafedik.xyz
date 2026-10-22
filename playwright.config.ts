// Site checks: Playwright runs the tests in tests/ against the built site (npm run check builds it first and serves it
// with astro preview) or against a deployed URL in BASE_URL (a Vercel preview or production; see tests/README.md).
import { defineConfig } from '@playwright/test';

const given = process.env.BASE_URL;
const base = given ? (given.startsWith('http') ? given : `https://${given}`).replace(/\/?$/, '/') : 'http://127.0.0.1:4329/';

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './tests/global-setup.ts',
  use: {
    baseURL: base,
    trace: 'retain-on-failure',
    // a Vercel preview is behind Deployment Protection: global-setup stores the bypass cookie here
    storageState: process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? 'tests/.auth/vercel.json' : undefined,
    // WebGL through SwiftShader, so the 3D scenes render on machines without a GPU
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'desktop', testIgnore: /perf\.spec/, use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', testIgnore: /perf\.spec/, use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
    // timing needs a quiet machine: the performance checks run after the rest, one at a time (perf.spec sets serial)
    { name: 'perf', testMatch: /perf\.spec/, dependencies: ['desktop', 'phone'] },
  ],
  webServer: given ? undefined : { command: 'npx astro preview --port 4329 --host 127.0.0.1 --ignore-lock', url: base, reuseExistingServer: true, timeout: 60_000 },
});
