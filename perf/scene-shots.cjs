// still pictures of the reel's scenes in both themes, for checking colours and edges by eye
// usage: PAGE=<url> node scene-shots.cjs <outdir> [stops, e.g. 1,3] [W] [H]
const { chromium } = require('playwright'); const fs = require('fs');
const [out, stops = '1,3', W = '1440', H = '900'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const theme of (process.env.THEMES || 'light,dark').split(',')) {
    const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +(process.env.DPR || 1), colorScheme: theme }), p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(t => { try { localStorage.setItem('nf-style', JSON.stringify({ theme: t })); } catch (e) {} }, theme);
    await p.goto(process.env.PAGE, { waitUntil: 'load' }); await p.waitForFunction(() => window.__reel || document.getElementById('reelCanvas').style.opacity, null, { timeout: 120000 }); await sleep(2500);
    for (const s of stops.split(',')) {
      await p.evaluate(s => document.querySelector(`[data-stop="${s}"]`).click(), s); await sleep(+(process.env.WAIT || 6000));
      const box = await p.locator('#reelCanvas').boundingBox();
      await p.screenshot({ path: `${out}/stop${s}-${theme}.png`, clip: box });
    }
    console.log(theme, 'errors:', errs.length ? errs : 'none'); await ctx.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
