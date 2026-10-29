# Self time per function (with file and line) in a V8 CPU profile (.cpuprofile JSON from Profiler.stop).
# usage: python3 profile-sum.py <profile.json> [top]
import json, sys, collections
pr = json.load(open(sys.argv[1])); top = int(sys.argv[2]) if len(sys.argv) > 2 else 25
nodes = {n['id']: n for n in pr['nodes']}
dt = collections.Counter()
for sid, d in zip(pr['samples'], pr['timeDeltas']): dt[sid] += d / 1000
self = collections.Counter()
for nid, ms in dt.items():
    cf = nodes[nid]['callFrame']; self[(cf['functionName'] or '(anon)', cf['url'].split('/')[-1].split('?')[0], cf['lineNumber'] + 1)] += ms
total = sum(self.values())
print(f'profile {total:.0f} ms sampled')
for (fn, url, ln), ms in self.most_common(top): print(f'  {ms:7.1f} ms {100 * ms / total:5.1f}%  {fn}  {url}:{ln}')
