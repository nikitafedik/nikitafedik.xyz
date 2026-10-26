# Turn intro captures (capture-intro.cjs: raw premultiplied RGBA from the WebGL canvas, bottom row first) into the small
# posters the home page shows before the 3D is ready.
# usage: python3 bake-intro-posters.py <capture dir> <out dir>   (labels like d1.15-dark, m0.46-light)
#
# The canvas holds premultiplied colour that can be brighter than its alpha (a bright blur edge adds light), which a
# straight-alpha image cannot store. So each poster holds what the visitor sees: the canvas at the intro's opacity over
# the page colour, encoded with the least alpha that reproduces it over that colour. Where the poster is transparent the
# page's faint colour field shows through as it does under the canvas. The poster is shown at full element opacity.
# The intro is blurred by 20-32 px, so 1/6 scale at WebP quality 85 keeps it within a few levels.
import glob, json, os, sys
import numpy as np
from PIL import Image

PAGE = {'dark': (np.array([16, 19, 24], float), 0.16), 'light': (np.array([243, 245, 249], float), 0.38)}
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
total = n = 0
for meta_file in sorted(glob.glob(f'{src}/*.json')):
    meta = json.load(open(meta_file)); lab = meta['label']
    raw = np.frombuffer(open(f'{src}/{lab}.rgba', 'rb').read(), np.uint8).reshape(meta['h'], meta['w'], 4)[::-1].astype(float)
    bg, op = PAGE[meta['theme']]
    a = raw[..., 3:4] / 255
    seen = np.clip(bg * (1 - a * op) + raw[..., :3] * op, 0, 255)             # what the visitor sees under the canvas
    up = np.where(seen >= bg, (seen - bg) / np.maximum(255 - bg, 1e-6), (bg - seen) / np.maximum(bg, 1e-6))
    alpha = np.clip(up.max(-1, keepdims=True), 0, 1)                           # least alpha that reaches the target
    premult = bg * alpha + (seen - bg)                                          # colour x alpha for the poster
    # downscale in premultiplied form, so transparent areas do not bleed into the edges
    w, h = max(1, meta['w'] // 6), max(1, meta['h'] // 6)
    pm =np.concatenate([premult, alpha * 255], -1)
    small = np.stack([np.asarray(Image.fromarray(pm[..., k].astype(np.float32), 'F').resize((w, h), Image.LANCZOS)) for k in range(4)], -1)
    sa = np.clip(small[..., 3:4] / 255, 0, 1)
    rgb = np.where(sa > 1e-4, small[..., :3] / np.maximum(sa, 1e-4), 0)
    img = np.concatenate([np.clip(rgb, 0, 255), sa * 255], -1).round().astype(np.uint8)
    name = lab.replace('.', '')   # d1.15-dark -> d115-dark
    Image.fromarray(img, 'RGBA').save(f'{out}/{name}.webp', 'WEBP', quality=85, alpha_quality=85, method=6)
    total += os.path.getsize(f'{out}/{name}.webp'); n += 1
print(f'{n} posters, {total / 1024:.0f} KB in all')
