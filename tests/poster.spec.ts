// The intro's prerendered pictures (img/intro/*.webp) must match the live intro they hand over to. When the dust scene,
// the lens or the colours change, this fails until the pictures are baked again (perf/capture-intro.cjs, then
// perf/bake-intro-posters.py). The comparison is made as a visitor sees it: both composited over the page colour at
// the intro's opacity, right when the 3D is ready (the poster is still up and the slow sway has barely started).
import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

for (const theme of ['dark', 'light'] as const) test(`the intro picture matches the live intro (${theme})`, async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(t => { try { localStorage.setItem('nf-style', JSON.stringify({ theme: t })); } catch (e) {} }, theme);
  await page.goto('?perf');
  await page.waitForFunction(() => (window as any).__reel, null, { timeout: 60_000, polling: 10 });
  // the page's frame loop has run once: it sets the canvas opacity and the out-of-focus blur
  await page.waitForFunction(() => document.getElementById('reelCanvas')!.style.opacity !== '', null, { timeout: 30_000, polling: 10 });
  const r = await page.evaluate(async () => {
    const poster = document.getElementById('reelPoster') as HTMLImageElement | null;
    if (!poster || poster.hidden) return null;
    const reel = (window as any).__reel, gl = reel.three.renderer.getContext();
    reel.render(performance.now());   // draw, then read before the browser presents and clears the buffer
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, live = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, live);
    // the poster at the canvas size, fitted like the page shows it (object-fit: cover)
    const img = new Image(); img.src = poster.src; await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!, s = Math.max(w / img.width, h / img.height);
    g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    const pic = g.getImageData(0, 0, w, h).data;
    const dark = document.documentElement.dataset.theme === 'dark', op = dark ? 0.16 : 0.38, bg = dark ? [16, 19, 24] : [243, 245, 249];
    const d: number[] = [];
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
      const iL = ((h - 1 - y) * w + x) * 4, iP = (y * w + x) * 4, aL = live[iL + 3] / 255, aP = pic[iP + 3] / 255;   // WebGL rows run bottom-up
      for (let k = 0; k < 3; k++) {
        const seenL = Math.min(255, bg[k] * (1 - aL * op) + live[iL + k] * op);   // the screen clips at white                 // the canvas is premultiplied
        const seenP = bg[k] * (1 - aP) + pic[iP + k] * aP;                       // the poster shows at full opacity
        d.push(Math.abs(seenL - seenP));
      }
    }
    d.sort((a, b) => a - b);
    return { src: poster.getAttribute('src'), mean: d.reduce((a, b) => a + b, 0) / d.length, p99: d[Math.floor(d.length * 0.99)] };
  });
  expect(r, 'a poster is shown for this screen').not.toBeNull();
  console.log(`${theme}: ${r!.src} mean ${r!.mean.toFixed(2)} p99 ${r!.p99.toFixed(1)} (of 255, as seen)`);
  // a current picture differs by p99 2-10 of 255 (more when the screen falls between two of the baked shapes); one
  // from an older scene, lens or colour set differs by tens
  expect(r!.p99, `${r!.src}: p99 difference from the live intro, as seen`).toBeLessThanOrEqual(12);
  expect(r!.mean, `${r!.src}: mean difference from the live intro, as seen`).toBeLessThanOrEqual(1.5);
  expect(errors).toEqual([]);
});
