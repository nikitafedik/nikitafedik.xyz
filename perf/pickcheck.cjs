// which poster each viewport picks, and the canvas shape it actually gets
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9455');
  for (const [W, H, dpr, mob] of [[1280, 800, 1, 0], [1366, 768, 1, 0], [1536, 864, 1.25, 0], [1920, 1080, 1, 0], [2560, 1300, 1.5, 0], [2560, 1440, 1, 0], [1024, 1366, 2, 1], [820, 1180, 2, 1], [390, 844, 3, 1], [412, 915, 2.6, 1], [360, 740, 3, 1]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: !!mob, hasTouch: !!mob }), p = await ctx.newPage();
    await p.goto(process.env.PAGE, { waitUntil: 'domcontentloaded' });
    const r = await p.evaluate(() => { const c = document.getElementById('reelCanvas').getBoundingClientRect(); return { src: document.getElementById('reelPoster').getAttribute('src'), a: +(c.width / c.height).toFixed(3) }; });
    console.log(`${W}x${H}${mob ? ' touch' : ''}: canvas ${r.a} -> ${r.src}`);
    await ctx.close();
  }
  await b.close();
})();
