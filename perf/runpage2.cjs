const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9457'); const ctx = await b.newContext(); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); if (process.env.CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: +process.env.CPU });
  await p.goto(process.argv[2]); await p.waitForFunction(() => window.__result, null, { timeout: 120000 });
  const r = await p.evaluate(() => window.__result); for (const [k, v] of Object.entries(r)) console.log(k.padEnd(48), JSON.stringify(v));
  await ctx.close(); await b.close();
})();
