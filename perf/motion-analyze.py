# Smoothness analysis of motion.cjs records.
# usage: python3 motion-analyze.py <record.json> [...]
# Each moving thing is compared with a smooth local curve (a quadratic fitted over 9 frames, Savitzky-Golay). A frame
# that sits off that curve is a visible jerk; whole-pixel rounding of the scroll (steps of 2, 3, 2 px) stays under 1 px
# and is reported apart. Also: stalls (a still frame in the middle of motion), direction flips while moving one way,
# frame gaps, and for scroll-driven things whether each frame's value follows that frame's scroll or the previous one's.
import json, sys
import numpy as np

def series(frames, key, idx=None):
    out = []
    for f in frames:
        x = f.get(key)
        if idx is not None: x = None if x is None or idx >= len(x) else x[idx]
        out.append(np.nan if x is None else float(x))
    return np.array(out)

def sg_residual(x, t, half=4):
    """distance of each point from a quadratic in time fitted to the 2*half+1 points around it (frame times vary)"""
    n = len(x); r = np.full(n, np.nan)
    for i in range(half, n - half):
        w = x[i - half:i + half + 1]
        if np.isnan(w).any(): continue
        tt = (t[i - half:i + half + 1] - t[i]) / 16.7
        c = np.polyfit(tt, w, 2); r[i] = x[i] - c[2]
    return r

def report(t, x, name, unit, scale, still):
    ok = ~np.isnan(x)
    if ok.sum() < 12: return None
    t, x = t[ok], x[ok]
    d = np.abs(np.diff(x))
    moving = np.convolve(d > still, np.ones(5), 'same') > 0   # around frames that move
    if moving.sum() < 6: return None
    res = np.abs(sg_residual(x, t)) * scale
    mres = res[1:][moving & ~np.isnan(res[1:])]
    # stalls: a frame that does not move while the frames on both sides move clearly
    stalls = [i for i in range(1, len(d) - 1) if d[i] <= still * 0.05 and d[i - 1] > 4 * still and d[i + 1] > 4 * still]
    v = np.diff(x)
    flips = [i for i in range(2, len(v) - 2) if abs(v[i]) > still and np.sign(v[i]) != np.sign(v[i - 1]) and np.sign(v[i]) != np.sign(v[i + 1]) and abs(v[i - 1]) > still and abs(v[i + 1]) > still]
    jerks = np.where(res * 1 > 2)[0] if scale == 1 else np.where(res > 2)[0]
    return dict(name=name, unit=unit, n=int(moving.sum()), p99=float(np.percentile(mres, 99)) if len(mres) else 0, mx=float(np.nanmax(mres)) if len(mres) else 0,
                jerks=len(jerks), jerk_at=[round(float(t[i] - t[0])) for i in jerks[:8]], stalls=len(stalls), flips=len(flips))

def lag(y, x, t):
    """x is set from the scroll by the page each frame: fit x(scroll) and check which frame's scroll explains x best"""
    ok = ~np.isnan(x) & ~np.isnan(y)
    if ok.sum() < 30: return None
    y, x = y[ok], x[ok]
    if np.ptp(y) < 50 or np.ptp(x) < 20: return None
    def resid(yy, xx):
        o = np.argsort(yy); ys, xs = yy[o], xx[o]
        # x as a function of scroll: median over neighbouring scroll values
        fit = np.interp(yy, ys, np.convolve(xs, np.ones(9) / 9, 'same'))
        sel = (yy > ys[10]) & (yy < ys[-10])
        return float(np.mean(np.abs(xx - fit)[sel]))
    return round(resid(y[1:], x[1:]), 2), round(resid(y[:-1], x[1:]), 2)

for path in sys.argv[1:]:
    d = json.load(open(path)); fr = d['frames']
    t = np.array([f['t'] for f in fr]); y = series(fr, 'y'); g = np.diff(t)
    print(f"\n== {path.split('/')[-1]}: {d['input']} {d['viewport']} cpu x{d['cpu']} {d['theme']}, {len(fr)} frames, errors {d['errs'] or 'none'}")
    print(f"   frame gaps: median {np.median(g):.1f} ms, p95 {np.percentile(g, 95):.1f}, max {g.max():.0f}, over 25 ms {int((g > 25).sum())}, over 50 ms {int((g > 50).sum())}")
    rows = [report(t, y, 'scroll', 'px', 1, 0.5), report(t, series(fr, 'ly'), 'intro text', 'px', 1, 0.5), report(t, series(fr, 'head'), 'heading', 'px', 1, 0.5)]
    # scene position in stops; 1 stop of scene change ~ a whole picture, so scale to "px" as 100 px per stop for the threshold
    rows.append(report(t, series(fr, 'stop'), 'scene position', 'stop/100', 100, 0.001))
    for k in range(4): rows.append(report(t, series(fr, 'pick', k), f'picker item {k}', 'px', 1, 0.5))
    rows.append(report(t, series(fr, 'cam', 2), 'camera distance', 'unit/100', 100, 0.001))
    for r in rows:
        if not r: continue
        extra = f", jerks over 2 px: {r['jerks']}" + (f" at ms {r['jerk_at']}" if r['jerks'] else '')
        print(f"   {r['name']:15} moving {r['n']:4} frames; off the smooth curve p99 {r['p99']:.2f} max {r['mx']:.2f} {r['unit']}{extra}; stalls {r['stalls']}, direction flips {r['flips']}")
    for nm, key in [('intro text', 'ly'), ('heading', 'head')]:
        lt = lag(y, series(fr, key), t)
        if lt: print(f"   lag {nm:10}: off the scroll curve using this frame's scroll {lt[0]} px, the previous frame's {lt[1]} px")
