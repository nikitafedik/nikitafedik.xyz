// A Chrome trace of entering the demo scene on a phone (CPU 4x, Intel GPU): the skill button for the illustration,
// then the one for the demo, which builds the demo app. Prints the long frames and what filled the longest.
// usage: PAGE=<url> node demo-entry.cjs <trace.json>
const { chromium } = require('playwright-core'); const { spawn, execSync } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const port = 9481 + Math.floor(Math.random() * 20), prof = 'de-' + Date.now() % 1e6;
  spawn(__dirname + '/launch.sh', [String(port), prof, '--use-adapter-luid=0,86604'], { detached: true, stdio: 'ignore' }).unref();
  let b = null; for (let i = 0; i < 30 && !b; i++) { await sleep(700); b = await chromium.connectOverCDP('http://127.0.0.1:' + port).catch(() => null); }
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  await p.addInitScript(() => { window.__loaf = []; new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.duration > 40) window.__loaf.push({ t: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.startTime + e.duration - e.renderStart), scripts: e.scripts.map(s => [s.sourceFunctionName || s.invoker, Math.round(s.duration), Math.round(s.forcedStyleAndLayoutDuration || 0)]) }); })).observe({ type: 'long-animation-frame' }); });
  await p.goto(process.env.PAGE + '?perf'); await p.waitForFunction(() => window.__reel, null, { timeout: 60000 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await p.evaluate(() => document.querySelector('[data-stop="2"]').click()); await sleep(4000);
  // SECOND=1: enter the demo once and leave it before the traced entry
  if (process.env.SECOND) { for (const s of [3, 4]) { await p.evaluate(s => document.querySelector(`[data-stop="${s}"]`).click(), s); await sleep(4000); } }
  const t0 = await p.evaluate(() => performance.now());
  // ALLPROC=1: trace every process (the GPU process too) with GPU categories
  await b.startTracing(process.env.ALLPROC ? null : p, { path: process.argv[2], categories: process.env.ALLPROC ? ['toplevel', 'devtools.timeline', 'gpu', 'viz', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] : ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'v8.execute'] });
  await p.evaluate(() => document.querySelector('[data-stop="3"]').click()); await sleep(4000);
  await b.stopTracing();
  const loaf = await p.evaluate(t0 => window.__loaf.filter(l => l.t > t0), t0);
  loaf.forEach(l => console.log(`long frame +${l.t - Math.round(t0)} ms: ${l.dur} ms (block ${l.block}, render ${l.render}) ${JSON.stringify(l.scripts.filter(s => s[1] > 3))}`));
  await b.close().catch(() => {});
  try { execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*nf-perf-audit-${prof}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: 'ignore' }); } catch (e) {}
})().catch(e => { console.error(e); process.exit(1); });
