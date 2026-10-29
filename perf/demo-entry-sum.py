# The three longest main-thread tasks in a demo-entry.cjs trace and what filled them.
# usage: python3 demo-entry-sum.py <trace.json>
import json, sys, collections
ev = json.load(open(sys.argv[1])); ev = ev['traceEvents'] if isinstance(ev, dict) else ev
names = {(e['pid'], e['tid']): e['args']['name'] for e in ev if e.get('ph') == 'M' and e.get('name') == 'thread_name'}
main = {k for k, v in names.items() if v == 'CrRendererMain'}
X = [e for e in ev if (e.get('pid'), e.get('tid')) in main and e.get('ph') == 'X']
for tk in sorted([e for e in X if e['name'] == 'RunTask'], key=lambda e: -e['dur'])[:3]:
    a, z = tk['ts'], tk['ts'] + tk['dur']; c = collections.Counter()
    for e in X:
        if a <= e['ts'] < z and e['name'] in ('UpdateLayoutTree', 'Layout', 'FunctionCall', 'Paint', 'PrePaint', 'Layerize', 'Commit'): c[e['name']] += e['dur'] / 1000
    print(f"task {tk['dur'] / 1000:.0f} ms:", {k: round(v) for k, v in c.most_common()})
