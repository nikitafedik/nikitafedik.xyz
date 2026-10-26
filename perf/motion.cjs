// Frame-by-frame motion record of the home page under real input: wheel notches (through Lenis), trackpad-style
// deltas, or touch flings. A probe runs first in every frame and reads what the previous frame showed: scroll, intro
// text offset, heading, picker, scene position, camera. Writes JSON for motion-analyze.py.
// usage: PAGE=<url> node motion.cjs <port> <out.json> <W> <H> <dpr> <mobile 0|1> <cpu> <input> [theme]
//   input: spin (fast wheel), notch (slow single notches), pad (trackpad deltas), up (wheel back up), fling (touch),
//          buttons (click each skill), keys (PageDown / Space)
const { chromium } = require('playwright-core');
const fs = require('fs');
const [port, out, W, H, DPR, MOB, CPU, INPUT, THEME = 'dark'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:' + port);
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +DPR, isMobile: MOB === '1', hasTouch: MOB === '1', colorScheme: THEME });
  const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p), errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(t => {
    try { localStorage.setItem('nf-style', JSON.stringify({ theme: t })); } catch (e) {}
    const rec = window.__rec = { on: false, f: [], loaf: [] }, raf = window.requestAnimationFrame.bind(window);
    try { new PerformanceObserver(l => l.getEntries().forEach(e => { if (!rec.on || e.duration < 30) return; rec.loaf.push({ t: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.startTime + e.duration - e.renderStart), style: Math.round(e.startTime + e.duration - (e.styleAndLayoutStart || e.startTime + e.duration)), scripts: e.scripts.map(s => ({ fn: s.sourceFunctionName || s.invoker, src: (s.sourceURL || '').split('/').pop(), ms: Math.round(s.duration), pre: Math.round(s.forcedStyleAndLayoutDuration || 0) })) }); })).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) {}
    const num = (el, prop) => { if (!el) return null; const v = el.style.getPropertyValue(prop); return v === '' ? null : parseFloat(v); };
    const ty = el => { const m = el && /translateY\((-?[\d.]+)px\)/.exec(el.style.transform); return m ? +m[1] : 0; };
    const probe = t => {
      raf(probe);   // registered first, so next frame it runs before the page's own frame callbacks
      if (!rec.on) return;
      const items = [...document.querySelectorAll('.reel-item')], perf = window.__perf, last = perf && perf[perf.length - 1], reel = window.__reel;
      const cam = reel && reel.three && reel.three.camera;
      rec.f.push({
        t, y: scrollY,
        ly: num(document.getElementById('introList'), '--ly'),
        head: ty(document.getElementById('reelTitle')),
        pick: items.map(el => num(el, '--y') === null ? null : parseFloat(/calc\(-50% \+ (-?[\d.]+)px\)/.exec(el.style.getPropertyValue('--y'))?.[1] ?? 'NaN')),
        stop: last ? last.stop : null, drew: last && last.t > (rec.lastT || 0) && last.render > 0 ? 1 : 0,
        cam: cam ? [cam.position.x, cam.position.y, cam.position.z, cam.zoom] : null,
      });
      if (last) rec.lastT = last.t;
    };
    raf(probe);
  }, THEME);
  await p.goto(process.env.PAGE + '?perf', { waitUntil: 'load' });
  await p.waitForFunction(() => window.__reel, null, { timeout: 120000 });
  if (+CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +CPU });
  await sleep(1500);
  const mouse = async () => { await p.mouse.move(+W * 0.6, +H * 0.5); };
  const wheel = async (dy, n, gap) => { for (let i = 0; i < n; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +W * 0.6, y: +H * 0.5, deltaX: 0, deltaY: dy }); await sleep(gap); } };
  await p.evaluate(() => { window.__rec.gpu = []; window.__reel.onGpu((ms, m) => window.__rec.gpu.push([Math.round(m.t), +ms.toFixed(2), m.lowRes ? 1 : 0, m.blurOn ? 1 : 0, m.calls, +m.stop.toFixed(3), +m.defocus.toFixed(2)])); window.__rec.on = true; });
  if (INPUT === 'spin') { await mouse(); for (let k = 0; k < 6; k++) { await wheel(100, 12, 45); await sleep(500); } }
  else if (INPUT === 'full') { await mouse(); for (let k = 0; k < 26; k++) { await wheel(100, 10, 50); await sleep(650); } }
  else if (INPUT === 'flick' || INPUT === 'flickup') {
    const up = INPUT === 'flickup';
    if (up) { await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.5)); await sleep(2500); await p.evaluate(() => { window.__rec.f.length = 0; }); }
    const flick = async dy => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: +W / 2, y: up ? +H * 0.3 : +H * 0.7 }] });
      for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: +W / 2, y: (up ? +H * 0.3 : +H * 0.7) - dy * i / 10 }] }); await sleep(10); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
    for (let k = 0; k < 14; k++) { await flick(up ? -380 : 380); await sleep(750); }
  }
  else if (INPUT === 'pauses') { await mouse(); for (let k = 0; k < 40; k++) { await p.evaluate(() => (window.__rec.marks = window.__rec.marks || []).push(performance.now())); await wheel(100, 2, 60); await sleep(+(process.env.PAUSE || 1100)); } }
  else if (INPUT === 'notch') { await mouse(); await wheel(100, 40, 380); }
  else if (INPUT === 'pad') { await mouse(); for (let k = 0; k < 8; k++) { for (let i = 0; i < 40; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: +W * 0.6, y: +H * 0.5, deltaX: 0, deltaY: Math.max(2, 34 * Math.exp(-i / 14)) }); await sleep(16); } await sleep(300); } }
  else if (INPUT === 'up') { await mouse(); await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.55)); await sleep(2500); await p.evaluate(() => { window.__rec.f.length = 0; }); for (let k = 0; k < 6; k++) { await wheel(-100, 12, 45); await sleep(500); } }
  else if (INPUT === 'fling') { for (let k = 0; k < 5; k++) { await cdp.send('Input.synthesizeScrollGesture', { x: +W / 2, y: +H * 0.7, yDistance: -Math.round(+H * 0.9), speed: 1800, gestureSourceType: 'touch', preventFling: false }); await sleep(900); } }
  else if (INPUT === 'flingup') { await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.45)); await sleep(2500); await p.evaluate(() => { window.__rec.f.length = 0; }); for (let k = 0; k < 5; k++) { await cdp.send('Input.synthesizeScrollGesture', { x: +W / 2, y: +H * 0.3, yDistance: Math.round(+H * 0.9), speed: 1800, gestureSourceType: 'touch', preventFling: false }); await sleep(900); } }
  else if (INPUT === 'buttons') { for (const s of [1, 2, 3, 4, 2, 1]) { await p.evaluate(s => document.querySelector(`[data-stop="${s}"]`).click(), s); await sleep(2600); } }
  await sleep(1800);
  const rec = await p.evaluate(() => { window.__rec.on = false; return window.__rec.f; });
  const loaf = await p.evaluate(() => window.__rec.loaf);
  const gpu = await p.evaluate(() => window.__rec.gpu);
  const t0 = rec.length ? rec[0].t : 0;
  loaf.forEach(l => console.log(`  long frame at ${l.t - Math.round(t0)} ms: ${l.dur} ms (render ${l.render}, style+layout ${l.style}) scripts ${JSON.stringify(l.scripts)}`));
  fs.writeFileSync(out, JSON.stringify({ input: INPUT, viewport: [+W, +H, +DPR, MOB === '1'], cpu: +CPU, theme: THEME, errs, frames: rec, loaf, gpu, marks: await p.evaluate(() => window.__rec.marks || []) }));
  console.log(`${INPUT} ${W}x${H}${MOB === '1' ? ' touch' : ''} cpu x${CPU}: ${rec.length} frames, errors: ${errs.length ? errs.join(' | ') : 'none'}`);
  await ctx.close(); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
