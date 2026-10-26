// Capture the live intro frame (atoms out of focus, top of the page) straight from the WebGL canvas, per viewport
// and theme. Writes raw premultiplied RGBA (bottom row first, as WebGL reads it) plus a JSON sidecar.
// usage: PAGE=<url> node capture-intro.cjs <outdir> <label:W:H:dpr:mobile:theme> [...]
const { chromium } = require('playwright-core');
const { spawn, execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const [outdir, ...specs] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const prof = 'cap-' + Date.now() % 1e6;
  spawn(__dirname + '/launch.sh', ['9453', prof, '--use-adapter-luid=0,86604'], { detached: true, stdio: 'ignore' }).unref();
  let b = null; for (let i = 0; i < 30 && !b; i++) { await sleep(700); b = await chromium.connectOverCDP('http://127.0.0.1:9453').catch(() => null); }
  for (const spec of specs) {
    const [label, W, H, dpr, mob, theme] = spec.split(':');
    const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dpr, isMobile: mob === '1', hasTouch: mob === '1', colorScheme: theme });
    const p = await ctx.newPage();
    await p.addInitScript(t => { try { localStorage.setItem('nf-style', JSON.stringify({ theme: t })); } catch (e) {} }, theme);
    await p.goto(process.env.PAGE + '?perf', { waitUntil: 'load' });
    await p.waitForFunction(() => window.__reel, null, { timeout: 60000 });
    await p.evaluate(() => window.scrollTo(0, 0));
    // the page's frame loop has run once (it sets the canvas opacity and the defocus), so the capture shows the real intro state
    await p.waitForFunction(() => document.getElementById('reelCanvas').style.opacity !== '', null, { timeout: 30000, polling: 16 });
    await sleep(+(process.env.WAIT || 2500));
    const r = await p.evaluate(() => {
      const reel = window.__reel, gl = reel.three.renderer.getContext(), cv = document.getElementById('reelCanvas');
      reel.render(performance.now());   // draw, then read before the browser presents and clears the buffer
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = ''; for (let i = 0; i < px.length; i += 32768) s += String.fromCharCode(...px.subarray(i, i + 32768));
      const rc = cv.getBoundingClientRect();
      return { w, h, b64: btoa(s), css: { w: rc.width, h: rc.height, left: rc.left, top: rc.top }, opacity: getComputedStyle(cv).opacity, theme: document.documentElement.dataset.theme, pr: reel.pixelRatio };
    });
    fs.writeFileSync(path.join(outdir, label + '.rgba'), Buffer.from(r.b64, 'base64'));
    delete r.b64;
    fs.writeFileSync(path.join(outdir, label + '.json'), JSON.stringify({ label, viewport: [+W, +H, +dpr, mob === '1'], ...r }));
    console.log(label, JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
  try { execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { \\$_.CommandLine -like '*${prof}*' -and \\$_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }"`); } catch (e) {}
})().catch(e => { console.error(e); process.exit(1); });
