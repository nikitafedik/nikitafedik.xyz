// Every change of page runs a cross-document view transition (Chromium), so the sidebar stays put while the content fades.
import { test, expect } from '@playwright/test';
import { isPhone } from './helpers';

test('every page change runs a view transition', async ({ page }) => {
  await page.addInitScript(() => addEventListener('pagereveal', (e: any) => {
    if (document.referrer) sessionStorage.setItem('vt:' + location.pathname, String(!!e.viewTransition));
  }));
  await page.goto('');
  await page.waitForTimeout(1500);
  for (const [href, path] of [['publications.html', '/publications.html'], ['projects.html', '/projects.html'], ['./', '/']]) {
    if (isPhone(page)) await page.locator('#menuBtn').click();
    await page.locator(`nav.tabs a[href="${href}"]`).click();
    await page.waitForURL(u => u.pathname === path);
    await page.waitForTimeout(800);
    expect(await page.evaluate(p => sessionStorage.getItem('vt:' + p), path), `arriving on ${path}`).toBe('true');
  }
});
