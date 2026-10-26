# Turn intro captures (capture-intro.cjs) into the small posters the home page shows before the 3D is ready.
# usage: python3 bake-intro-posters.py <capture dir> <out dir>   (labels like d1.15-dark, m0.46-light)
# The intro is blurred by 20-32 px, so 1/6 scale at WebP quality 85 matches the live frame within 2/255 as seen.
import glob, os, sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
total = 0
for f in sorted(glob.glob(f'{src}/*.png')):
    lab = os.path.basename(f)[:-4]
    if lab.endswith('-seen') or '-' not in lab: continue
    im = Image.open(f)
    name = lab.replace('.', '')   # d1.15-dark -> d115-dark
    small = im.resize((max(1, im.width // 6), max(1, im.height // 6)), Image.LANCZOS)
    small.save(f'{out}/{name}.webp', 'WEBP', quality=85, alpha_quality=85, method=6)
    total += os.path.getsize(f'{out}/{name}.webp')
print(f'{len(os.listdir(out))} posters, {total / 1024:.0f} KB in all')
