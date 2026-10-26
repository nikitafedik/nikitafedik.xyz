// Cold first visit (fresh browser profile per run) on an emulated network: when the 3D reel is ready, LCP, bytes.
// usage: node netload.js <runs> <net: none|fast4g|slow4g> <cpu> <name=url> [<name=url> ...]
const { chromium } = require('playwright-core');
const { execSync, spawn } = require('child_process');
const NETS = { none: null, slow4g: { latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 750e3 / 8 }, fast4g: { latency: 40, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 } };
const [runs, net, cpu, ...pages] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const stopProfile = name => { try { execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { \\$_.CommandLine -like '*${name}*' -and \\$_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }"`); } catch (e) {} };
(async () => {
  for (let run = 0; run < +runs; run++) for (const pg of pages) {
    const [name, url] = pg.split('='), prof = `net-${name}-${run}-${Date.now() % 1e6}`;
    spawn(__dirname + '/launch.sh', ['9451', prof, '--use-adapter-luid=0,86604'], { detached: true, stdio: 'ignore' }).unref();
    let b = null; for (let i = 0; i < 30 && !b; i++) { await sleep(700); b = await chromium.connectOverCDP('http://127.0.0.1:9451').catch(() => null); }
    const ctx = await b.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25, colorScheme: 'dark' });
    const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    if (NETS[net]) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...NETS[net] });
    if (+cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +cpu });
    let bytes = 0; cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
    await p.addInitScript(() => { window.__lcp = 0; new PerformanceObserver(l => l.getEntries().forEach(e => { window.__lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
      window.__poster = 0; const tick = () => { const i = document.getElementById('reelPoster'); if (i && !i.hidden && i.complete && i.naturalWidth) window.__poster = Math.round(performance.now()); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      window.__long = []; new PerformanceObserver(l => l.getEntries().forEach(e => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: true }); });
    await p.goto(url + '?perf', { waitUntil: 'load', timeout: 180000 });
    await p.waitForFunction(() => window.__reel, null, { timeout: 180000, polling: 50 });
    const r = await p.evaluate(() => ({ poster: window.__poster, ready: Math.round(performance.now()), lcp: Math.round(window.__lcp), load: Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd), long: window.__long }));
    console.log(`${net} cpu x${cpu} run ${run} ${name.padEnd(8)} background ${r.poster ? r.poster + ' ms (poster)' : r.ready + ' ms (3D)'}, reel ready ${r.ready} ms, load ${r.load} ms, LCP ${r.lcp} ms, ${(bytes / 1024).toFixed(0)} KB, long tasks ${JSON.stringify(r.long)}`);
    await ctx.close(); await b.close(); stopProfile(prof); await sleep(2500);
  }
})().catch(e => { console.error(e); process.exit(1); });
