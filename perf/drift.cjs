// how the intro frame changes over the first seconds after the 3D starts: read the canvas at several times
const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9455');
  const ctx = await b.newContext({ viewport: { width: 1920, height: 870 }, colorScheme: 'light' }), p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('nf-style', JSON.stringify({ theme: 'light' })); } catch (e) {} });
  await p.goto(process.env.PAGE + '?perf');
  await p.waitForFunction(() => window.__reel, null, { timeout: 60000, polling: 10 });
  await p.waitForFunction(() => document.getElementById('reelCanvas').style.opacity !== '', null, { polling: 10 });
  const t0 = Date.now();
  for (const ms of [0, 50, 100, 200, 400, 800, 1600, 3200]) {
    while (Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 5));
    const r = await p.evaluate(() => { const reel = window.__reel, gl = reel.three.renderer.getContext(), cam = reel.three.camera, h = reel.three.holder;
      reel.render(performance.now()); const w = gl.drawingBufferWidth, hh = gl.drawingBufferHeight, px = new Uint8Array(w * hh * 4); gl.readPixels(0, 0, w, hh, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = ''; for (let i = 0; i < px.length; i += 32768) s += String.fromCharCode(...px.subarray(i, i + 32768));
      return { b64: btoa(s), cam: [cam.position.x, cam.position.y, cam.position.z, cam.zoom].map(v => +v.toFixed(4)), rotY: +h.rotation.y.toFixed(4), motion: +reel.motion.toFixed(4) }; });
    fs.writeFileSync(`_out/drift-${ms}.rgba`, Buffer.from(r.b64, 'base64'));
    console.log(ms, 'cam', JSON.stringify(r.cam), 'holder rotY', r.rotY, 'motion', r.motion);
  }
  await ctx.close(); await b.close();
})();
