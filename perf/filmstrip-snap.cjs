// filmstrips of a snap glide down, a snap glide up, and leaving the illustration (camera hand-over), recorded with
// the CDP screencast; every Nth frame goes into one strip per case
const { chromium } = require('playwright-core'); const fs = require('fs'); const { execFileSync } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9457');
  for (const [W, H] of [[1440, 900], [1920, 1080]]) {
    const ctx = await b.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark' }), p = await ctx.newPage(), cdp = await ctx.newCDPSession(p);
    await p.goto(process.env.PAGE + '?perf', { waitUntil: 'load' }); await p.waitForFunction(() => window.__reel, null, { timeout: 60000 }); await sleep(1500);
    await p.mouse.move(W * 0.6, H / 2);
    const wheel = async (dy, n) => { for (let i = 0; i < n; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W * 0.6, y: H / 2, deltaX: 0, deltaY: dy }); await sleep(60); } };
    const record = async (name, act, ms) => {
      const frames = []; const on = f => { frames.push(f.data); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}); };
      cdp.on('Page.screencastFrame', on); await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1, maxWidth: 720 });
      await act(); await sleep(ms); await cdp.send('Page.stopScreencast'); cdp.off('Page.screencastFrame', on);
      const dir = `_out/fs-${name}-${W}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
      frames.forEach((d, k) => fs.writeFileSync(`${dir}/${String(k).padStart(3, '0')}.jpg`, Buffer.from(d, 'base64')));
      console.log(name, W, frames.length, 'frames');
    };
    await p.evaluate(() => document.querySelector('[data-stop="1"]').click()); await sleep(3000);
    await record('snapdown', () => wheel(100, 2), 2600);
    await record('snapup', () => wheel(-100, 2), 2600);
    await p.evaluate(() => document.querySelector('[data-stop="2"]').click()); await sleep(3500);
    // through the illustration's stretch and out of it
    await record('leaveill', () => wheel(100, 14), 2800);
    await ctx.close();
  }
  await b.close();
})();
