# Where the renderer main thread spends its time in a Chrome trace: total ms per event name (complete events, no
# nesting correction, so parents include children), plus the elements most often restyled and laid out.
# usage: python3 trace-sum.py <trace.json>
import json, sys, collections
ev = json.load(open(sys.argv[1])); ev = ev['traceEvents'] if isinstance(ev, dict) else ev
names = {(e['pid'], e['tid']): e['args']['name'] for e in ev if e.get('ph') == 'M' and e.get('name') == 'thread_name'}
main = [k for k, v in names.items() if v == 'CrRendererMain']
tot = collections.Counter(); cnt = collections.Counter(); frames = 0
for e in ev:
    if (e.get('pid'), e.get('tid')) not in main or e.get('ph') != 'X': continue
    tot[e['name']] += e.get('dur', 0) / 1000; cnt[e['name']] += 1
span = (max(e['ts'] for e in ev if 'ts' in e) - min(e['ts'] for e in ev if 'ts' in e and e['ts'] > 0)) / 1000
print(f'trace span {span:.0f} ms, main threads {len(main)}')
for n, ms in tot.most_common(22): print(f'  {ms:8.1f} ms  {cnt[n]:5d}x  {n}')
# style recalc element counts and layout objects
rs = [e for e in ev if (e.get('pid'), e.get('tid')) in main and e.get('name') in ('UpdateLayoutTree', 'Layout') and e.get('ph') == 'X']
for n in ('UpdateLayoutTree', 'Layout'):
    v = [e for e in rs if e['name'] == n]
    if not v: continue
    if n == 'UpdateLayoutTree': els = [e.get('args', {}).get('elementCount', 0) for e in v]; print(f'{n}: {len(v)} runs, elements per run median {sorted(els)[len(els)//2]}, max {max(els)}')
    else:
        objs = [e.get('args', {}).get('endData', {}).get('layoutObjects', 0) if isinstance(e.get('args', {}).get('endData'), dict) else 0 for e in v]
        print(f'{n}: {len(v)} runs, objects median {sorted(objs)[len(objs)//2]}, max {max(objs)}')
# forced layouts: Layout or UpdateLayoutTree with a stack (from script)
st = collections.Counter()
for e in ev:
    if e.get('name') in ('Layout', 'UpdateLayoutTree') and (e.get('pid'), e.get('tid')) in main:
        bd = e.get('args', {}).get('beginData', {})
        stack = bd.get('stackTrace') if isinstance(bd, dict) else None
        if stack: st[(e['name'], stack[0].get('functionName'), stack[0].get('lineNumber'))] += e.get('dur', 0) / 1000
print('forced from script (name, function, line): ms')
for k, ms in st.most_common(10): print(f'  {ms:7.1f}  {k}')
