# How motion settles after input stops: overshoot (moving back after the main motion), the scene position and the
# picker at rest, per pause in the input. usage: python3 settle.py <record.json> [...]
import json, sys
import numpy as np
for path in sys.argv[1:]:
    d = json.load(open(path)); fr = d['frames']; t = np.array([f['t'] for f in fr]); y = np.array([f['y'] for f in fr], float)
    st = np.array([np.nan if f['stop'] is None else f['stop'] for f in fr])
    # rest windows: the scroll has not changed for 400 ms
    moving = np.r_[False, np.abs(np.diff(y)) > 0]
    last_move = np.maximum.accumulate(np.where(moving, t, -1e9))
    rest = (t - last_move) > 700
    out = []; i = 0
    while i < len(fr):
        if rest[i]:
            j = i
            while j < len(fr) and rest[j]: j += 1
            seg = slice(i, j)
            s = st[seg]; s = s[~np.isnan(s)]
            if len(s) > 5:
                # scene position over the rest window: final value, travel back after its extreme (overshoot)
                k0 = max(0, i - 60); pre = st[k0:j]; pre = pre[~np.isnan(pre)]
                final = s[-1]; ext = pre.max() if pre[-1] >= pre[0] else pre.min(); over = abs(ext - final)
                pick = fr[j - 1]['pick']; cur = min((p for p in (pick or []) if p is not None), key=abs, default=None)
                out.append((round(t[i] - t[0]), round(final, 4), round(over, 4), None if cur is None else round(cur, 2), round(abs(s[-1] - s[0]), 4)))
            i = j
        else: i += 1
    print(f"\n{path.split('/')[-1]}: {len(out)} pauses")
    for o in out: print(f"   at {o[0]:6} ms: scene {o[1]:.4f}{' (whole stop)' if abs(o[1] - round(o[1])) < 0.002 else ''}, overshoot {o[2]:.4f}, still moving during pause {o[4]:.4f}, nearest picker entry {o[3]} px off centre")
