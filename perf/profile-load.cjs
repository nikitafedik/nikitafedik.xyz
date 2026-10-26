// Cold-load CPU profile through reel init: long tasks, then time per page/engine function.
// usage: PAGE=<url> node profile-load.js <port> <W> <H> <dpr> <mobile 0|1> <cpuThrottle>
const { chromium } = require('playwright-core');
const [port, W, H, DPR, MOB, CPU] = process.argv.slice(2);
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR, isMobile: MOB === '1', hasTouch: MOB === '1', colorScheme: 'dark' });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  if (+CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +CPU });
  await page.addInitScript(() => { window.__long = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push([Math.round(e.startTime), Math.round(e.duration)]))).observe({ type: 'longtask', buffered: true }); });
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  await page.goto(process.env.PAGE + '?perf', { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.__reel, null, { timeout: 120000 });
  const ready = await page.evaluate(() => Math.round(performance.now()));
  await page.waitForTimeout(4000);
  const { profile } = await cdp.send('Profiler.stop');
  const long = await page.evaluate(() => window.__long);
  const byId = new Map(), parent = new Map(), dt = new Map();
  profile.nodes.forEach(n => { byId.set(n.id, n); (n.children || []).forEach(c => parent.set(c, n.id)); });
  profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) || 0) + (profile.timeDeltas[i] || 0) / 1000));
  const key = n => { const f = n.callFrame, file = (f.url || '').split('/').pop().split('?')[0]; return `${f.functionName || '(anon)'} ${file}:${f.lineNumber + 1}`; };
  const self = new Map(), total = new Map();
  for (const [id, ms] of dt) { const k = key(byId.get(id)); self.set(k, (self.get(k) || 0) + ms); const seen = new Set();
    for (let c = id; c !== undefined; c = parent.get(c)) { const kk = key(byId.get(c)); if (!seen.has(kk)) { seen.add(kk); total.set(kk, (total.get(kk) || 0) + ms); } } }
  const top = (m, n, f = () => true) => [...m].filter(([k]) => f(k)).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n');
  console.log(`reel ready at ${ready} ms; long tasks [start, ms]: ${JSON.stringify(long)}`);
  console.log('-- self --\n' + top(self, 14, k => !/^\(idle\)/.test(k)));
  console.log('-- inclusive, engine and page --\n' + top(total, 28, k => /reel3d|index\.html|set-clay|sky\.js/.test(k)));
  await ctx.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
