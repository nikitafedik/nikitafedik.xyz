// For a protected Vercel preview: one visit with the bypass secret sets a cookie, saved as storage state for every test.
// The cookie (not a request header) carries the bypass, so requests to other sites (fonts, CDN scripts) stay unchanged.
import { chromium, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';

export default async function globalSetup(config: FullConfig) {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!secret) return;
  const base = config.projects[0].use.baseURL as string;
  mkdirSync('tests/.auth', { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${base}?x-vercel-protection-bypass=${encodeURIComponent(secret)}&x-vercel-set-bypass-cookie=true`);
  await page.context().storageState({ path: 'tests/.auth/vercel.json' });
  await browser.close();
}
