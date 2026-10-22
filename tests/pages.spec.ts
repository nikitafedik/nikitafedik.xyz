// The three pages load cleanly and link to each other; the phone menu, the CV (not published) and the publications list.
import { test, expect } from '@playwright/test';
import { watchErrors, isPhone } from './helpers';

const PAGES: [string, string][] = [['', 'Nikita Fedik'], ['publications.html', 'Publications | Nikita Fedik'], ['projects.html', 'Projects | Nikita Fedik']];

for (const [path, title] of PAGES) {
  test(`${path || 'home'} loads without errors and links the three pages`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('nav.tabs a')).toHaveText([/home/i, /projects/i, /publications/i]);
    await expect(page.locator('a[href="cv.html"]')).toHaveCount(0);
    await page.waitForTimeout(2000);
    expect(errors).toEqual([]);
  });
}

test('the CV is not published', async ({ request }) => {
  expect((await request.get('cv.html')).status()).toBe(404);
});

test('the phone menu opens and closes', async ({ page }) => {
  test.skip(!isPhone(page), 'phones only');
  for (const path of ['', 'publications.html']) {
    await page.goto(path);
    const btn = page.locator('#menuBtn');
    await btn.click();
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#sideMenu a[href="publications.html"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
  }
});

test('publications: every entry, even spacing, cover tiles open the cover', async ({ page }) => {
  await page.goto('publications.html');
  await expect(page.locator('.pub')).toHaveCount(41);
  const tiles = page.locator('.cv-tile');
  await expect(tiles).toHaveCount(3);
  const rows = await page.evaluate(() => [...document.querySelectorAll('.pub')].map(li => {
    const a = li.getBoundingClientRect(), n = li.querySelector('.n')!.getBoundingClientRect(), b = li.querySelector('.body')!.getBoundingClientRect();
    return { top: a.top, bottom: a.bottom, n: n.height, body: b.height };
  }));
  // the number column (with its molecule or cover tile) never makes an entry taller than its text
  for (const r of rows) expect(r.n).toBeLessThanOrEqual(r.body + 8);
  const gaps = rows.slice(1).map((r, i) => r.top - rows[i].bottom);
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(3);
  await tiles.first().click();
  const box = page.locator('dialog.cover-box[open]');
  await expect(box).toBeVisible();
  await expect.poll(() => box.locator('img').evaluate((i: HTMLImageElement) => i.complete ? i.naturalWidth : 0)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog.cover-box[open]')).toHaveCount(0);
});
