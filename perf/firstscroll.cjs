// The first swipes on a phone, from a cold load: reading swipes start right after the load event, while the reel is
// still starting up. Every frame records the scroll and the intro text position; long animation frames come with
// their scripts; marks show when reel3d.js arrived and when the reel was ready. Fresh Chrome profile per run.
// usage: PAGE=<url> node firstscroll.cjs <out.json> [W H dpr cpu]
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const fs = require('fs');
const [out, W = '390', H = '844', DPR = '3', CPU = '4'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const port = 9461 + Math.floor(Math.random() * 30), prof = 'fs-' + Date.now() % 1e6;
  spawn(__dirname + '/launch.sh', [String(port), prof, '--use-adapter-luid=0,86604'], { detached: true, stdio: 'ignore' }).unref();
  let b = null; for (let i = 0; i < 30 && !b; i++) { await sleep(700); b = await chromium.connectOverCDP('http://127.0.0.1:' + port).catch(() => null); }
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR, isMobile: true, hasTouch: true, colorScheme: process.env.THEME || 'dark' });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    const rec = window.__rec = { f: [], loaf: [], marks: {} }, raf = window.requestAnimationFrame.bind(window);
    try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (e.duration < 34) return; rec.loaf.push({ t: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.startTime + e.duration - e.renderStart), scripts: e.scripts.map(s => ({ fn: s.sourceFunctionName || s.invoker, src: (s.sourceURL || '').split('/').pop(), ms: Math.round(s.duration), pre: Math.round(s.forcedStyleAndLayoutDuration || 0) })) }); })).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
    const probe = t => {
      raf(probe);
      const L = document.getElementById('introList');
      rec.f.push({ t: Math.round(t * 10) / 10, y: scrollY, ly: L ? parseFloat(L.style.getPropertyValue('--ly')) : null });
      if (window.__reel && !rec.marks.ready) { rec.marks.ready = Math.round(t); rec.gpu = []; window.__reel.onGpu((ms, m) => rec.gpu.push([Math.round(m.t), +ms.toFixed(2), m.lowRes ? 1 : 0, m.blurOn ? 1 : 0])); }
    };
    raf(probe);
    rec.marks.resizes = 0; addEventListener('resize', () => rec.marks.resizes++);
    rec.touch = []; addEventListener('touchstart', e => rec.touch.push([Math.round(e.timeStamp), 1]), { passive: true }); addEventListener('touchend', e => rec.touch.push([Math.round(e.timeStamp), 0]), { passive: true });
  });
  // EXTRA_CSS: a style sheet added to the page, to measure what a part of it costs
  if (process.env.EXTRA_CSS) await p.addInitScript(css => document.addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: css }))), process.env.EXTRA_CSS);
  if (+CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +CPU });
  let tracing = null;
  // BOOT_PROFILE=<file>: a CPU profile from the start of the load until the reel is ready plus 1.5 s
  if (process.env.BOOT_PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  // BOOT_TRACE=<file>: a Chrome trace of all processes (GPU included) from the start of the load for 4 s
  if (process.env.BOOT_TRACE) { await b.startTracing(null, { path: process.env.BOOT_TRACE, categories: (process.env.TRACE_CATS || 'toplevel,devtools.timeline,gpu,viz,disabled-by-default-devtools.timeline,blink.user_timing').split(',') }); tracing = (async () => { await sleep(4500); await b.stopTracing(); })(); }
  await p.goto(process.env.PAGE + '?perf', { waitUntil: 'load' });
  if (process.env.BOOT_PROFILE) tracing = (async () => { await p.waitForFunction(() => window.__rec.marks.ready, null, { timeout: 60000 }); await sleep(1500); const { profile } = await cdp.send('Profiler.stop'); fs.writeFileSync(process.env.BOOT_PROFILE, JSON.stringify(profile)); })();
  const loadAt = await p.evaluate(() => Math.round(performance.now()));
  await sleep(+(process.env.DELAY || 300));
  // TRACE=<file>: a Chrome trace of the reveal, from the reel being ready plus 1.5 s, for 4 s
  if (process.env.TRACE) {
    tracing = (async () => {
      await p.waitForFunction(() => window.__rec.marks.ready, null, { timeout: 60000 }); await sleep(1500);
      await b.startTracing(p, { path: process.env.TRACE, categories: (process.env.TRACE_CATS || 'devtools.timeline,disabled-by-default-devtools.timeline,blink,cc,v8.execute,disabled-by-default-v8.cpu_profiler').split(',') });
      await sleep(4000); await b.stopTracing();
    })();
  }
  // PROFILE=<file>: a CPU profile of the reveal (same window as TRACE), self time per function and line
  if (process.env.PROFILE) {
    tracing = (async () => {
      await p.waitForFunction(() => window.__rec.marks.ready, null, { timeout: 60000 }); await sleep(1500);
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
      await sleep(4000);
      const { profile } = await cdp.send('Profiler.stop'); fs.writeFileSync(process.env.PROFILE, JSON.stringify(profile));
    })();
  }
  // reading swipes: about 160 px each over 200 ms, then a short pause
  for (let k = 0; k < +(process.env.SWIPES || 24); k++) {
    let y = 600;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: +W / 2, y }] });
    for (let i = 0; i < 10; i++) { y -= 16; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: +W / 2, y }] }); await sleep(20); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(+(process.env.PAUSE || 350));
  }
  await sleep(1500);
  if (tracing) await tracing;
  const rec = await p.evaluate(() => {
    const r = window.__rec, res = performance.getEntriesByType('resource').filter(e => /reel3d|set-clay|room-env|three/.test(e.name));
    r.marks.res = res.map(e => [e.name.split('/').pop().split('?')[0], Math.round(e.responseEnd)]);
    return r;
  });
  rec.marks.load = loadAt;
  fs.writeFileSync(out, JSON.stringify({ viewport: [+W, +H, +DPR], cpu: +CPU, errs, ...rec }));
  const g = rec.f.slice(1).map((f, i) => f.t - rec.f[i].t), over = g.filter(x => x > 50).length;
  console.log(`frames ${rec.f.length}, gaps over 50 ms ${over}, longest ${Math.max(...g).toFixed(0)} ms; load ${loadAt}, reel ready ${rec.marks.ready}; errors ${errs.length ? errs.join(' | ') : 'none'}`);
  if (rec.gpu && rec.gpu.length) { const v = rec.gpu.map(x => x[1]).sort((a, b) => a - b); console.log(`gpu ms per frame: median ${v[v.length >> 1]}, p90 ${v[Math.floor(v.length * 0.9)]}, max ${v[v.length - 1]} (${v.length} frames)`); }
  if (!process.env.QUIET) rec.loaf.forEach(l => console.log(`  long frame at ${l.t} ms: ${l.dur} ms (block ${l.block}, render ${l.render}) ${JSON.stringify(l.scripts.filter(s => s.ms > 5))}`));
  await ctx.close(); await b.close().catch(() => {});
  try { require('child_process').execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*nf-perf-audit-${prof}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"`, { stdio: 'ignore' }); } catch (e) {}
})().catch(e => { console.error(e); process.exit(1); });
