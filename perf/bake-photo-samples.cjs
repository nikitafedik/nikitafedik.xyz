// run bake-photo-samples.html in Chrome and write public/img/<photo>-sample.webp: an opaque 352x110 lossless picture,
// the sample's RGB on the left half and its alpha (in red) on the right, so the page reads the bytes back exactly
const { chromium } = require('playwright-core'); const { execFileSync } = require('child_process'); const fs = require('fs');
(async () => {
  const b = await chromium.connectOverCDP('http://127.0.0.1:9457'); const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8862/perf/bake-photo-samples.html'); await p.waitForFunction(() => window.__result, null, { timeout: 60000 });
  const r = await p.evaluate(() => window.__result);
  for (const [name, b64] of Object.entries(r)) fs.writeFileSync(`_out/${name}-sample.rgba`, Buffer.from(b64, 'base64'));
  await ctx.close(); await b.close();
  console.log(execFileSync('python3', ['-c', `
import numpy as np, os
from PIL import Image
for n in ['illus-dark', 'illus-light', 'illus-dark-1200', 'illus-light-1200']:
    a = np.frombuffer(open(f'_out/{n}-sample.rgba', 'rb').read(), np.uint8).reshape(110, 176, 4)
    img = np.zeros((110, 352, 3), np.uint8); img[:, :176] = a[..., :3]; img[:, 176:, 0] = a[..., 3]
    f = f'../public/img/{n}-sample.webp'; Image.fromarray(img).save(f, 'WEBP', lossless=True, method=6)
    back = np.asarray(Image.open(f).convert('RGB')); ok = (back == img).all()
    print(n, os.path.getsize(f), 'bytes, round trip exact:', bool(ok), ', points with alpha:', int((a[..., 3] > 15).sum()))
`]).toString());
})();
