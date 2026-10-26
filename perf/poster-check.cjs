// Intro poster check: when the poster shows versus when the 3D is ready, a filmstrip through the hand-off, and the
// difference between the poster-only and live-only frames. Fresh browser profile per case (cold, like a first visit).
// usage: PAGE=<url> node poster-check.cjs <outdir> <label:W:H:dpr:mobile:theme> [...]
const { chromium } = require('playwright-core');
const { spawn, execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const [outdir, ...specs] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  for (const spec of specs) {
    const [label, W, H, dpr, mob, theme] = spec.split(':'), prof = 'pc-' + label + '-' + Date.now() % 1e6;
    spawn(__dirname + '/launch.sh', ['9454', prof, '--use-adapter-luid=0,86604'], { detached: true, stdio: 'ignore' }).unref();
    let b = null; for (let i = 0; i < 30 && !b; i++) { await sleep(700); b = await chromium.connectOverCDP('http://127.0.0.1:9454').catch(() => null); }
    const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dpr, isMobile: mob === '1', hasTouch: mob === '1', colorScheme: theme });
    const p = await ctx.newPage(), errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(t => { try { localStorage.setItem('nf-style', JSON.stringify({ theme: t })); } catch (e) {} }, theme);
    await p.goto(process.env.PAGE + '?perf', { waitUntil: 'commit' });
    // the poster on screen: loaded and not hidden
    await p.waitForFunction(() => { const i = document.getElementById('reelPoster'); return i && !i.hidden && i.complete && i.naturalWidth > 0; }, null, { timeout: 60000, polling: 10 });
    const tPoster = await p.evaluate(() => Math.round(performance.now()));
    const shots = [];
    const shoot = async tag => { const f = path.join(outdir, `${label}-${tag}.png`); await p.screenshot({ path: f }); shots.push(f); };
    await shoot('0-poster');
    await p.waitForFunction(() => window.__reel, null, { timeout: 120000, polling: 10 });
    const tReady = await p.evaluate(() => Math.round(performance.now()));
    const states = [];
    for (let k = 0; k < 8; k++) {
      states.push(await p.evaluate(() => { const i = document.getElementById('reelPoster'); return { t: Math.round(performance.now()), poster: i ? i.style.opacity || getComputedStyle(i).opacity : 'gone', canvas: document.getElementById('reelCanvas').style.opacity }; }));
      await shoot(`1-fade${k}`); await sleep(90);
    }
    await sleep(1200);
    await shoot('2-live');
    const gone = await p.evaluate(() => !document.getElementById('reelPoster'));
    console.log(`${label}: poster at ${tPoster} ms, 3D ready at ${tReady} ms (poster ${tReady - tPoster} ms earlier); poster removed after fade: ${gone}; errors: ${errs.length ? errs.join(' | ') : 'none'}`);
    console.log('  fade states ' + states.map(s => `${s.t}:${s.poster}/${s.canvas}`).join(' '));
    fs.writeFileSync(path.join(outdir, label + '.json'), JSON.stringify({ label, tPoster, tReady, states, shots }));
    await ctx.close(); await b.close();
    try { execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { \\$_.CommandLine -like '*${prof}*' -and \\$_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }"`); } catch (e) {}
    await sleep(2000);
  }
})().catch(e => { console.error(e); process.exit(1); });
