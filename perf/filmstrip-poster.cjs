// filmstrip of the intro scroll while only the poster is up (reel3d.js blocked), down and back up
const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9455');
  for (const [W, H] of [[1440, 900], [1920, 1080]]) for (const theme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, colorScheme: theme }), p = await ctx.newPage();
    await p.addInitScript(t => { try { localStorage.setItem('nf-style', JSON.stringify({ theme: t })); } catch (e) {} }, theme);
    await p.route('**/reel3d.js', r => r.abort());
    await p.goto(process.env.PAGE, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    const max = await p.evaluate(() => { const i = document.querySelector('.intro'); return i.offsetHeight; });
    const ys = [0, 0.25, 0.5, 0.75, 1, 0.5, 0];
    for (let k = 0; k < ys.length; k++) { await p.mouse.wheel(0, 0); await p.evaluate(y => window.scrollTo(0, y), Math.round(ys[k] * max)); await p.waitForTimeout(900); await p.screenshot({ path: `perf/_out/fs-${W}-${theme}-${k}.png` }); }
    await ctx.close();
  }
  await b.close();
})();
