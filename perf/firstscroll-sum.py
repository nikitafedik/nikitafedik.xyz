# Summary of firstscroll.cjs records: frame pacing while the page boots and while the intro text reveals.
# usage: python3 firstscroll-sum.py <record.json> [...]
import json, sys
import numpy as np
for path in sys.argv[1:]:
    d = json.load(open(path)); f = d['f']; m = d['marks']
    t = np.array([x['t'] for x in f]); y = np.array([x['y'] for x in f]); g = np.diff(t)
    ld, rd = m['load'], m.get('ready', 0)
    def win(a, b, name):
        k = (t[1:] >= a) & (t[1:] < b)
        if not k.any(): return
        print(f'   {name:28} frames {k.sum():4d}, median gap {np.median(g[k]):5.1f} ms, p95 {np.percentile(g[k], 95):5.0f}, max {g[k].max():5.0f}, over 50 ms {int((g[k] > 50).sum())}')
    # the intro reveal: from the first scroll until the scroll passes the intro (y about 1100 on a 390 x 844 phone)
    mv = np.where(y > 0)[0]; s0 = t[mv[0]] if len(mv) else ld
    e = t[np.where(y > 1100)[0][0]] if (y > 1100).any() else t[-1]
    blocked = [l for l in d['loaf'] if ld - 50 <= l['t'] <= rd + 1500]
    print(f'== {path.split("/")[-1]}: load {ld}, reel ready {rd} (+{rd - ld} ms), first scroll at {s0:.0f}, long frames after load until ready+1.5 s: {sum(l["dur"] for l in blocked)} ms in {len(blocked)}')
    # while a finger is down, from load to the reel being ready plus 3 s: every frame gap counts, since the intro text
    # follows the finger only on frames
    tc = d.get('touch', []); downs = [(a[0], b[0]) for a, b in zip(tc[::2], tc[1::2]) if a[1] == 1 and b[1] == 0]
    gaps = []
    for a, b in downs:
        k = (t[1:] > a) & (t[:-1] < b); gaps += list(g[k]) if k.any() else [b - a]
    if gaps: gaps = np.array(gaps); print(f'   finger down, all {len(downs)} swipes:, longest gap {gaps.max():5.0f} ms, gaps over 50 ms {int((gaps > 50).sum())}, time in them {gaps[gaps > 50].sum():5.0f} ms')
    def down(sel, name):
        gg = []
        for a, b in sel:
            k = (t[1:] > a) & (t[:-1] < b); gg += list(g[k]) if k.any() else [b - a]
        if gg: gg = np.array(gg); print(f'   {name:28} median gap {np.median(gg):5.1f} ms, p95 {np.percentile(gg, 95):5.0f}, longest {gg.max():5.0f}, over 50 ms {int((gg > 50).sum())} ({gg[gg > 50].sum():5.0f} ms)')
    down(downs[:6], 'finger down, first 6 swipes')
    down(downs[6:], 'finger down, swipes 7 on')
    win(ld, rd + 1500, 'boot (load to ready+1.5 s)')
    win(max(s0, rd + 1500), e, 'reveal after boot')
