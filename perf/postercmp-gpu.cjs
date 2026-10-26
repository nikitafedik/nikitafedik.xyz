const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9455');
  for (const [W, H, dpr, mob] of (process.env.VP ? JSON.parse(process.env.VP) : [[1440, 900, 1, 0], [390, 844, 2, 1]])) for (const theme of ['dark', 'light']) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: !!mob, hasTouch: !!mob }), p = await ctx.newPage();
    await p.addInitScript(t => { try { localStorage.setItem('nf-style', JSON.stringify({ theme: t })); } catch (e) {} }, theme);
    await p.goto(process.env.PAGE + '?perf');
    await p.waitForFunction(() => window.__reel, null, { timeout: 60000, polling: 10 });
    await p.waitForFunction(() => document.getElementById('reelCanvas').style.opacity !== '', null, { timeout: 30000, polling: 10 });
  const r = await p.evaluate(async () => {
    const poster = document.getElementById('reelPoster');
    if (!poster || poster.hidden) return null;
    const reel = window.__reel, gl = reel.three.renderer.getContext();
    reel.render(performance.now());   // draw, then read before the browser presents and clears the buffer
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, live = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, live);
    // the poster at the canvas size, fitted like the page shows it (object-fit: cover)
    const img = new Image(); img.src = poster.src; await img.decode();
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }), s = Math.max(w / img.width, h / img.height);
    g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
    const pic = g.getImageData(0, 0, w, h).data;
    const dark = document.documentElement.dataset.theme === 'dark', op = dark ? 0.16 : 0.38, bg = dark ? [16, 19, 24] : [243, 245, 249];
    const d = [];
    for (let y = 4; y < h; y += 8) for (let x = 4; x < w; x += 8) {
      const iL = ((h - 1 - y) * w + x) * 4, iP = (y * w + x) * 4, aL = live[iL + 3] / 255, aP = pic[iP + 3] / 255;   // WebGL rows run bottom-up
      for (let k = 0; k < 3; k++) {
        const seenL = Math.min(255, bg[k] * (1 - aL * op) + live[iL + k] * op);   // the screen clips at white                 // the canvas is premultiplied
        const seenP = bg[k] * (1 - aP) + pic[iP + k] * aP;                       // the poster shows at full opacity
        d.push(Math.abs(seenL - seenP)); (window.__band = window.__band || Array(10).fill(0).map(() => [0, 0]))[Math.min(9, Math.floor(10 * x / w))][0] += Math.abs(seenL - seenP); window.__band[Math.min(9, Math.floor(10 * x / w))][1]++;
      }
    }
    d.sort((a, b) => a - b);
    const band = window.__band.map(([a, n]) => +(a / n).toFixed(1)); window.__band = null; return { band, src: poster.getAttribute('src'), mean: d.reduce((a, b) => a + b, 0) / d.length, p99: d[Math.floor(d.length * 0.99)] };
  });
    console.log(W, theme, JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
})();
