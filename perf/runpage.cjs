// open a page in a fresh profile on the Intel GPU and print window.__result
const { chromium } = require('playwright-core'); const { spawn, execSync } = require('child_process');
(async () => {
  const prof = 'rp-' + Date.now() % 1e6; spawn(__dirname + '/launch.sh', ['9452', prof, '--use-adapter-luid=0,86604'], { detached: true, stdio: 'ignore' }).unref();
  let b = null; for (let i = 0; i < 30 && !b; i++) { await new Promise(r => setTimeout(r, 700)); b = await chromium.connectOverCDP('http://127.0.0.1:9452').catch(() => null); }
  const p = await (await b.newContext()).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(process.argv[2]); await p.waitForFunction(() => window.__result, null, { timeout: 60000 }).catch(() => {});
  console.log(JSON.stringify(await p.evaluate(() => window.__result)), errs.slice(0, 3));
  await b.close(); try { execSync(`powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { \\$_.CommandLine -like '*${prof}*' -and \\$_.CommandLine -notlike '*--type=*' } | ForEach-Object { Stop-Process -Id \\$_.ProcessId -Force }"`); } catch (e) {}
})();
