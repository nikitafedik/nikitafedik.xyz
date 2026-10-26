# the state just before each new input in a 'pauses' record: is the scene whole and the picker entry centred?
import json, sys
d = json.load(open(sys.argv[1])); fr = d['frames']; marks = d.get('marks') or []
whole = mid = intro = 0
for m in marks:
    prev = [f for f in fr if f['t'] <= m - 30]
    if not prev: continue
    f = prev[-1]; s = f['stop']
    if s is None: continue
    cur = min((p for p in (f['pick'] or []) if p is not None), key=abs, default=None)
    tag = 'whole' if abs(s - round(s)) < 0.002 else 'MID'
    if s < 1: tag = 'intro'
    whole += tag == 'whole'; mid += tag == 'MID'; intro += tag == 'intro'
    print(f"  scroll {f['y']:6.0f}  scene {s:.4f}  {tag:5}  picker entry {cur} px off centre")
print(f"whole scenes {whole}, mid-change {mid}, in the intro {intro}")
