# One-off edit: add the prerendered intro poster to public/index.html (markup, CSS, hand-off in paintFrame).
import sys
p = sys.argv[1]; s = open(p).read()
def rep(old, new, label):
    global s
    assert s.count(old) == 1, label
    s = s.replace(old, new)
rep(".reel-canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; z-index: 0; pointer-events: none; }\n",
""".reel-canvas { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; z-index: 0; pointer-events: none; }
/* the intro's out-of-focus atoms as a small prerendered picture: on screen from the first paint, it hands over to the
   live 3D as the canvas fades in. Dimmed like the out-of-focus canvas (1 - 0.62 light, 1 - 0.84 dark) */
.reel-poster { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; z-index: 0; pointer-events: none; object-fit: cover; opacity: .38; }
:root[data-theme="dark"] .reel-poster { opacity: .16; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .reel-poster { opacity: .16; } }
""", 'css')
rep("""          <canvas class="reel-canvas" id="reelCanvas" aria-hidden="true"></canvas>\n""",
"""          <img class="reel-poster" id="reelPoster" alt="" aria-hidden="true" decoding="async" hidden>
          <canvas class="reel-canvas" id="reelCanvas" aria-hidden="true"></canvas>
          <script>
          // the prerendered intro picture closest to this canvas's shape, for the theme and pointer (phones draw fewer
          // atoms): img/intro/{d|m}<width/height x100>-{dark|light}.webp, made by perf/capture-intro.cjs and
          // perf/bake-intro-posters.py; bake them again whenever the intro scene changes
          (() => {
            const p = document.getElementById('reelPoster'), c = document.getElementById('reelCanvas'), mm = q => window.matchMedia(q).matches;
            if (mm('(prefers-reduced-motion: reduce)')) return;
            const pick = () => {
              const r = c.getBoundingClientRect();
              if (!p.isConnected || !r.width || !r.height) return;
              const coarse = mm('(pointer: coarse)'), t = document.documentElement.dataset.theme, dark = t ? t === 'dark' : mm('(prefers-color-scheme: dark)');
              const shapes = coarse ? [0.40, 0.46, 0.53, 0.62] : [0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.30, 1.50, 1.75], a = r.width / r.height;
              const s = shapes.reduce((b, x) => Math.abs(Math.log(x / a)) < Math.abs(Math.log(b / a)) ? x : b);
              const src = `img/intro/${coarse ? 'm' : 'd'}${s.toFixed(2).replace('.', '')}-${dark ? 'dark' : 'light'}.webp`;
              if (p.getAttribute('src') !== src) p.src = src;
              p.hidden = false;
            };
            pick();
            new MutationObserver(pick).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
            addEventListener('resize', pick);
          })();
          </script>
""", 'markup')
rep("""  if (opG !== paintFrame.op) { reelCanvas.style.opacity = opG; paintFrame.op = opG; }\n""",
"""  if (opG !== paintFrame.op) { reelCanvas.style.opacity = opG; paintFrame.op = opG; }
  // the prerendered intro picture hands over to the canvas while it fades in, then leaves the page
  if (reelPoster) { if (fadeIn >= 1) { reelPoster.remove(); reelPoster = null; } else reelPoster.style.opacity = ((1 - dim) * (1 - fadeIn)).toFixed(3); }
""", 'handoff')
rep("function paintFrame(dt) {\n", "let reelPoster = document.getElementById('reelPoster');\nfunction paintFrame(dt) {\n", 'decl')
open(p, 'w').write(s)
print('poster added')
