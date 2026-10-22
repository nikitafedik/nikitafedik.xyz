// A brief performance check, meant to run before every push:
//   at rest nothing keeps running: no frame loop, no 3D redraws, only the slow decorative motion restyling the page
//   (a blur restyled on every frame once went unnoticed until the site felt slow);
//   a whole-page touch scroll on a phone with a 4x slower CPU has no long freezes.
// The freeze limit is set with PERF_LONG_TASK_MS (default 350: test browsers draw WebGL in software, on the CPU,
// which makes 3D work look slower than on a phone's GPU; on the Intel UHD 770 the worst freeze was about 110 ms).
import { test, expect } from '@playwright/test';
import { countFrames, idleRates, goToSkill } from './helpers';

test.describe.configure({ mode: 'serial' });
const DESKTOP = { viewport: { width: 1440, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SPOTS: [string, number][] = [['top of the page', 0], ['chemistry', 1], ['illustration', 2], ['demo', 3], ['tutorials', 4]];

for (const [device, use] of [['desktop', DESKTOP], ['phone', PHONE]] as const) test.describe(device, () => {
test.use(use);
test('nothing keeps running at rest', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(countFrames);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto('?perf');
  await page.waitForFunction(() => (window as any).__reel, null, { timeout: 60_000 });
  for (const [name, stop] of SPOTS) {
    if (stop) await goToSkill(page, stop);
    // timed scene animations (a network pulse, a surface filling in) finish within a few seconds
    await page.waitForTimeout(8000);
    const r = await idleRates(page, cdp);
    // the demo's turntables keep spinning at about 30 frames a second by design
    const frames = name === 'demo' ? 40 : 2, restyles = name === 'demo' ? 50 : 25;
    expect.soft(r.raf, `${name}: frame callbacks per second at rest`).toBeLessThanOrEqual(frames);
    expect.soft(r.draws, `${name}: 3D redraws per second at rest`).toBe(0);
    expect.soft(r.restyles, `${name}: style recalcs per second at rest`).toBeLessThanOrEqual(restyles);
  }
});

});

test.describe('phone', () => {
test.use(PHONE);
test('a phone scrolls the whole page without long freezes', async ({ page }) => {
  test.setTimeout(240_000);
  const limit = Number(process.env.PERF_LONG_TASK_MS || 350);
  await page.addInitScript(() => {
    (window as any).__long = [];
    new PerformanceObserver(l => l.getEntries().forEach(e => (window as any).__long.push([Math.round(e.duration), Math.round(scrollY)]))).observe({ type: 'longtask', buffered: true });
  });
  await page.goto('?perf');
  await page.waitForFunction(() => (window as any).__reel, null, { timeout: 60_000 });
  await page.waitForTimeout(3000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => { (window as any).__long.length = 0; });
  const end = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  // finger swipes, each about 450 px over 250 ms, until the bottom of the page
  for (let guard = 0; guard < 80 && await page.evaluate(() => scrollY) < end * 0.97; guard++) {
    let y = 700;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y }] });
    for (let k = 0; k < 15; k++) { y -= 30; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const long: [number, number][] = await page.evaluate(() => (window as any).__long);
  console.log('long tasks while scrolling [ms, at scrollY]:', JSON.stringify(long));
  expect(Math.max(0, ...long.map(l => l[0])), `longest freeze while scrolling (limit ${limit} ms)`).toBeLessThanOrEqual(limit);
});
});
