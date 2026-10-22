import { expect, type Page, type CDPSession } from '@playwright/test';

/** Collects uncaught page errors and console errors (network errors from other sites are not the page's own). */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(m.text()); });
  return errors;
}

/** Scrolls to y and waits two frames, so the page's own frame loop has painted that position. */
export async function scrollToY(page: Page, y: number) {
  await page.evaluate(y => new Promise(r => { scrollTo(0, y); requestAnimationFrame(() => requestAnimationFrame(r)); }), y);
}

/** Counts requestAnimationFrame calls, so an idle page can be checked for frame loops that never stop. */
export const countFrames = `window.__raf = 0; { const r = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => { window.__raf++; return r(cb); }; }`;

/** Work per second over a window of stillness: frame callbacks, 3D draws (needs ?perf in the URL) and style recalcs. */
export async function idleRates(page: Page, cdp: CDPSession, ms = 2000) {
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  const read = () => page.evaluate(() => ({ raf: (window as any).__raf ?? 0, draws: ((window as any).__perf || []).filter((x: any) => x.render > 0).length }));
  const m0 = await metric(), a = await read();
  await page.waitForTimeout(ms);
  const m1 = await metric(), b = await read();
  const s = ms / 1000;
  return { raf: (b.raf - a.raf) / s, draws: (b.draws - a.draws) / s, restyles: (m1.RecalcStyleCount - m0.RecalcStyleCount) / s };
}

/** Clicks a skill in the picker and waits until the scroll has settled. */
export async function goToSkill(page: Page, stop: number) {
  await page.evaluate(s => (document.querySelector(`[data-stop="${s}"]`) as HTMLElement).click(), stop);
  await expect.poll(async () => {
    const a = await page.evaluate(() => scrollY); await page.waitForTimeout(300);
    return Math.abs(a - await page.evaluate(() => scrollY));
  }, { timeout: 20_000, intervals: [100] }).toBeLessThan(1);
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900;
