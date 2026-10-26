// trace a wheel spin through the hand-off and list the longest events on any thread during frames over 60 ms
const { chromium } = require('playwright-core');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9457');
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
  await p.goto(process.env.PAGE + '?perf', { waitUntil: 'load' }); await p.waitForFunction(() => window.__reel, null, { timeout: 60000 }); await sleep(2000);
  const events = []; cdp.on('Tracing.dataCollected', e => events.push(...e.value)); const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,viz,gpu,blink,disabled-by-default-gpu.service,v8,toplevel', transferMode: 'ReportEvents' });
  await p.mouse.move(860, 450);
  const UP = process.env.UP === '1';
  if (UP) { await cdp.send('Tracing.end'); await done; events.length = 0; await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight * 0.55)); await sleep(2500);
    const done2 = new Promise(r => cdp.once('Tracing.tracingComplete', r)); cdp.on('Tracing.dataCollected', e => events.push(...e.value)); await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,cc,viz,gpu,blink,disabled-by-default-gpu.service,v8,toplevel', transferMode: 'ReportEvents' }); global.__done2 = done2; }
  for (let k = 0; k < (UP ? 6 : 3); k++) { for (let i = 0; i < 12; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 860, y: 450, deltaX: 0, deltaY: UP ? -100 : 100 }); await sleep(45); } await sleep(500); }
  await sleep(800);
  await cdp.send('Tracing.end'); await (global.__done2 || done);
  fs.writeFileSync('_out/stall-trace.json', JSON.stringify(events));
  // frames: main-thread animation frames (BeginMainThreadFrame / FireAnimationFrame) to find the gap
  const raf = events.filter(e => e.name === 'FireAnimationFrame' && e.ph === 'X').map(e => e.ts).sort((a, b) => a - b);
  let gap = null; for (let i = 1; i < raf.length; i++) if (raf[i] - raf[i - 1] > 60000 && (!gap || raf[i] - raf[i - 1] > gap[1] - gap[0])) gap = [raf[i - 1], raf[i]];
  console.log('animation frames', raf.length, 'largest gap ms', gap ? ((gap[1] - gap[0]) / 1000).toFixed(1) : 'none');
  if (gap) {
    const names = {}; events.filter(e => e.ph === 'M' && e.name === 'thread_name').forEach(e => { names[e.pid + ':' + e.tid] = e.args.name; });
    const inGap = events.filter(e => e.ph === 'X' && e.dur > 3000 && e.ts < gap[1] && e.ts + e.dur > gap[0]);
    inGap.sort((a, b) => b.dur - a.dur).slice(0, 30).forEach(e => console.log(`${(e.dur / 1000).toFixed(1).padStart(7)} ms  ${(names[e.pid + ':' + e.tid] || e.tid).toString().padEnd(26)} ${e.name} ${e.args && e.args.data && e.args.data.url ? e.args.data.url.slice(-40) : ''}`));
  }
  await ctx.close(); await b.close();
})();
