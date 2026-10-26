// Record the poster -> live hand-off frame by frame (CDP screencast) and print the canvas area's mean brightness per
// frame, so a dip or jump in the cross-fade shows up. Saves frames for viewing. Fresh profile per case (cold start).
// usage: PAGE=<url> node handoff-video.cjs <outdir> <label:W:H:theme> [...]
const { chromium } = require('playwright-core');
const { spawn, execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const [outdir, ...specs] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (const spec of specs) {
    const [label, W, H, theme] = spec.split(':'), prof = 'hv-' + label + '-' + Date.now() % 1e6;
    spawn(__dirname + '/launch.sh', ['9456', prof, '--use-adapter-luid=0,86604'], { detached: true, stdio: 'ignore' }).unref();
    let b = null; for (let i = 0; i < 30 && !b; i++) { await sleep(700); b = await chromium.connectOverCDP('http://127.0.0.1:9456').catch(() => null); }
    const ctx = await b.newContext({ viewport: { width: +W, height: +H }, colorScheme: theme });
    const p = await ctx.newPage(), cdp = await ctx.newCDPSession(p), frames = [];
    await p.addInitScript(t => { try { localStorage.setItem('nf-style', JSON.stringify({ theme: t })); } catch (e) {} }, theme);
    cdp.on('Page.screencastFrame', async f => { frames.push({ t: f.metadata.timestamp, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); });
    await p.goto(process.env.PAGE + '?perf', { waitUntil: 'commit' });
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1 });
    await p.waitForFunction(() => window.__reel, null, { timeout: 120000, polling: 10 });
    const readyWall = Date.now() / 1000;
    await sleep(1500);
    await cdp.send('Page.stopScreencast');
    const box = await p.evaluate(() => { const r = document.getElementById('reelCanvas').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; });
    // keep frames from 300 ms before the 3D was ready to the end
    const keep = frames.filter(f => f.t > readyWall - 0.3);
    keep.forEach((f, k) => fs.writeFileSync(path.join(outdir, `${label}-${String(k).padStart(3, '0')}.png`), Buffer.from(f.data, 'base64')));
    fs.writeFileSync(path.join(outdir, `${label}.json`), JSON.stringify({ label, box, t0: readyWall, times: keep.map(f => f.t) }));
    console.log(`${label}: ${keep.length} frames from 0.3 s before ready to 1.5 s after`);
    await ctx.close(); await b.close();
    try { execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { \\$_.CommandLine -like '*${prof}*' -and \\$_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }"`); } catch (e) {}
    await sleep(2000);
  }
})().catch(e => { console.error(e); process.exit(1); });
