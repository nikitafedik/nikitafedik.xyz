// Small spinning ball-and-stick molecules under the numbers of cover papers, one per paper.
// Each <svg class="mol" data-mol="..."> gets its atoms and bonds drawn here and turns slowly
// about the vertical axis while it is on screen.
const COLOR = { C: '#5B6578', H: '#E8EBF1', N: '#4F74D6', O: '#D9553F', Cd: '#C98A4B', Se: '#E3B341',
  Sb: '#8A6FD1', In: '#4FA3A5', Pd: '#9AA3B2', Sn: '#7E8AA0', Bi: '#C76B98', Na: '#9B6FD6', B: '#E9A3A3' };
const SIZE = { H: 0.55, C: 0.8, N: 0.8, O: 0.8, Cd: 1, Se: 1, Sb: 1, In: 1, Pd: 1, Sn: 1, Bi: 1, Na: 1.15, B: 0.85 };

// a planar hexagon of atoms with outward hydrogens, centred at (cx, cy)
function ring(cx, cy, el = 'C', hs = [0, 1, 2, 3, 4, 5], r = 1.4, rot = 0) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const a = rot + i * Math.PI / 3, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    out.push([el, x, y, 0]);
    if (hs.includes(i)) out.push(['H', cx + (r + 1.05) * Math.cos(a), cy + (r + 1.05) * Math.sin(a), 0]);
  }
  return out;
}
const icosa = (r) => {
  const p = (1 + Math.sqrt(5)) / 2, v = [];
  for (const s of [-1, 1]) for (const t of [-1, 1]) v.push([0, s, t * p], [s, t * p, 0], [t * p, 0, s]);
  const n = Math.hypot(1, p);
  return v.map(([x, y, z]) => [x * r / n, y * r / n, z * r / n]);
};
const cube = (r) => { const v = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x * r, y * r, z * r]); return v; };

const MOL = {
  // NaBH3-: a sodium anion bound to the boron of a pyramidal BH3 (the VIP paper)
  nabh3: { atoms: [['B', 0, 0, 0], ['Na', 0, -2.55, 0], ...[0, 1, 2].map(k => ['H', 1.05 * Math.cos(k * 2 * Math.PI / 3), 0.45, 1.05 * Math.sin(k * 2 * Math.PI / 3)])], cut: 2.7 },
  benzene: { atoms: ring(0, 0, 'C', [0, 1, 2, 3, 4, 5], 1.4, Math.PI / 6), cut: 1.6 },
  naphthalene: { atoms: [...ring(-1.21, 0, 'C', [1, 2, 3, 4], 1.4, Math.PI / 6), ...ring(1.21, 0, 'C', [0, 1, 4, 5], 1.4, Math.PI / 6).filter(a => !(a[0] === 'C' && Math.abs(a[1]) < 0.3))], cut: 1.6 },
  azobenzene: { atoms: [...ring(-3.1, -0.9, 'C', [1, 2, 3, 4, 5], 1.4, 0), ['N', -0.62, -0.45, 0], ['N', 0.62, 0.45, 0], ...ring(3.1, 0.9, 'C', [0, 1, 2, 4, 5], 1.4, 0)], cut: 1.75 },
  cdse: { atoms: cube(1.35).map(([x, y, z], i) => [((i ^ (i >> 1) ^ (i >> 2)) & 1) ? 'Cd' : 'Se', x, y, z]), cut: 2.8 },
  sbin: { atoms: [['Sb', 0, 0, 0], ...icosa(2.2).map(v => ['Sb', ...v]), ...cube(1.9).map(v => ['In', ...v])], cut: 2.45 },
  pdsnbi: { atoms: [['Pd', 0.75, 0, 0.43], ['Pd', -0.75, 0, 0.43], ['Pd', 0, 0, -0.87], ...cube(1.7).map(v => ['Sn', ...v]),
    ...[[2.6, 0, 0], [-2.6, 0, 0], [0, 2.6, 0], [0, -2.6, 0], [0, 0, 2.6], [0, 0, -2.6]].map(v => ['Bi', ...v])], cut: 2.65 }
};

const NS = 'http://www.w3.org/2000/svg';
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const items = [...document.querySelectorAll('svg.mol')].map((svg, k) => {
  const m = MOL[svg.dataset.mol];
  if (!m) return null;
  // centre and scale the molecule into the unit box
  const n = m.atoms.length, c = [0, 1, 2].map(j => m.atoms.reduce((s, a) => s + a[j + 1], 0) / n);
  const pts = m.atoms.map(a => [a[1] - c[0], a[2] - c[1], a[3] - c[2]]);
  const span = Math.max(...pts.map(p => Math.hypot(...p))) + 0.6;
  const bonds = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const cut = (m.atoms[i][0] === 'H' || m.atoms[j][0] === 'H') ? 1.2 : m.cut;
    if (Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]) < cut) bonds.push([i, j]);
  }
  const lines = bonds.map(() => svg.appendChild(document.createElementNS(NS, 'line')));
  const dots = m.atoms.map(a => { const d = svg.appendChild(document.createElementNS(NS, 'circle')); d.setAttribute('fill', COLOR[a[0]]); return d; });
  const flat = pts.every(p => Math.abs(p[2]) < 1e-6);
  return { svg, pts: pts.map(p => p.map(v => v / span)), el: m.atoms.map(a => a[0]), bonds, lines, dots, flat, phase: k * 1.3, on: false, r0: 0.17 * 4.2 / Math.max(4.2, span) };
}).filter(Boolean);

function draw(it, t) {
  // clusters turn about the vertical axis; flat molecules turn in their own plane, tipped back so they never go edge-on
  const a = it.phase + t * 0.0007, ca = Math.cos(a), sa = Math.sin(a), tilt = it.flat ? 0.95 : 0.45, ct = Math.cos(tilt), st = Math.sin(tilt);
  const P = it.pts.map(([x, y, z]) => {
    if (it.flat) { const x1 = x * ca - y * sa, y1 = x * sa + y * ca; return [x1, y1 * ct, y1 * st]; }
    const x1 = x * ca + z * sa, z1 = -x * sa + z * ca; return [x1, y * ct - z1 * st, y * st + z1 * ct];
  });
  it.bonds.forEach(([i, j], b) => {
    const l = it.lines[b];
    l.setAttribute('x1', P[i][0].toFixed(3)); l.setAttribute('y1', P[i][1].toFixed(3));
    l.setAttribute('x2', P[j][0].toFixed(3)); l.setAttribute('y2', P[j][1].toFixed(3));
  });
  // atoms painted back to front, nearer ones slightly larger
  const order = P.map((p, i) => i).sort((i, j) => P[i][2] - P[j][2]);
  order.forEach(i => {
    const d = it.dots[i], s = 1 + P[i][2] * 0.25;
    d.setAttribute('cx', P[i][0].toFixed(3)); d.setAttribute('cy', P[i][1].toFixed(3));
    d.setAttribute('r', (it.r0 * SIZE[it.el[i]] * s).toFixed(3));
    it.svg.appendChild(d);
  });
}

items.forEach(it => draw(it, 0));
if (!reduce && items.length) {
  const io = new IntersectionObserver(es => es.forEach(e => { const it = items.find(x => x.svg === e.target); if (it) it.on = e.isIntersecting; }));
  items.forEach(it => io.observe(it.svg));
  let last = 0;
  const loop = now => {
    requestAnimationFrame(loop);
    if (now - last < 33) return;   // 30 fps is plenty for a slow turn
    last = now;
    items.forEach(it => { if (it.on) draw(it, now); });
  };
  requestAnimationFrame(loop);
}
