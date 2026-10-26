# Convert captured premultiplied, bottom-up RGBA from WebGL into straight-alpha PNGs, plus a preview on the page colour.
import json, sys, numpy as np
from PIL import Image
for lab in sys.argv[2:]:
    d = sys.argv[1]; meta = json.load(open(f'{d}/{lab}.json'))
    a = np.frombuffer(open(f'{d}/{lab}.rgba', 'rb').read(), np.uint8).reshape(meta['h'], meta['w'], 4)[::-1].astype(np.float64)
    al = a[..., 3:4] / 255.0
    rgb = np.where(al > 0, a[..., :3] / np.maximum(al, 1e-6), 0).clip(0, 255)
    Image.fromarray(np.concatenate([rgb, a[..., 3:4]], -1).round().astype(np.uint8), 'RGBA').save(f'{d}/{lab}.png')
    # preview: composited at the page's opacity over the page background, as the visitor sees it
    bg = np.array([16, 19, 24] if meta['theme'] == 'dark' else [243, 245, 249], np.float64)
    op = float(meta['opacity']); comp = bg * (1 - al * op) + a[..., :3] * op
    Image.fromarray(comp.clip(0, 255).round().astype(np.uint8)).save(f'{d}/{lab}-seen.png')
    print(lab, meta['w'], meta['h'], 'alpha mean', round(float(al.mean()), 3))
