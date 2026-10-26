// objects that become visible for the first time while scrolling (first draws can stall the GPU on Windows)
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9457');
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage();
  await p.goto(process.env.PAGE + '?perf', { waitUntil: 'load' }); await p.waitForFunction(() => window.__reel, null, { timeout: 60000 }); await p.waitForTimeout(3000);
  const vis = () => p.evaluate(() => { const out = []; const scene = window.__reel.three.scene;
    const walk = (o, on) => { const v = on && o.visible; if (v && (o.isMesh || o.isPoints || o.isLine || o.isSprite) && (o.count === undefined || o.count > 0)) out.push(`${o.type}:${o.name || '-'}:${(o.material && o.material.type) || ''}:${o.id}`); o.children.forEach(c => walk(c, v)); };
    walk(scene, true); return out; });
  const seen = new Set(await vis()); console.log('visible at the top:', [...seen].join(' | '));
  const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  for (let y = 0; y <= max; y += 40) {
    await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(110);
    const now = await vis(), fresh = now.filter(x => !seen.has(x));
    if (fresh.length) { const st = await p.evaluate(() => { const a = window.__perf; return a.length ? a[a.length - 1].stop.toFixed(3) : '?'; }); console.log(`scroll ${y} (stop ${st}): first visible ${fresh.join(' | ')}`); fresh.forEach(x => seen.add(x)); }
  }
  await ctx.close(); await b.close();
})();
