// Particle reel for the skills section. One instanced cloud of spheres moves
// between named formations; some formations are also small live demos.
// Every particle is a damped spring chasing a target, so motion carries
// momentum. The camera re-frames itself to fit each formation, a lens pass
// fades the edges and adds a slight chromatic fringe and motion blur, and
// formations can carry short annotations that the page draws as HTML labels.
//   setStop(f)        smoothed scroll position along ORDER
//   override(name)    pin the cloud to a formation (selector hover)
//   act(name, a, v)   drive a demo; results arrive through onInfo()
//   labels()          visible annotations as [{ text, x, y, alpha }] in canvas pixels
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = window.matchMedia('(pointer: coarse)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rand = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
// the room lighting never changes, so it ships prebaked: img/room-env.webp holds the filtered (PMREM) environment
// in RGBE, mantissas on the left half, exponent (red) and alpha (green) on the right. Filtering it on load compiled and
// ran the PMREM shaders on the main thread, about 1 s on a first visit
async function loadRoomEnv() {
  // loaded as an image, not with fetch: some hosts allow images but block fetch
  const img = new Image();
  img.src = new URL('img/room-env.webp', document.baseURI).href;
  await img.decode();
  const bmp = await createImageBitmap(img, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const W2 = bmp.width, w = W2 / 2, h = bmp.height, c = document.createElement('canvas');
  c.width = W2; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const src = g.getImageData(0, 0, W2, h).data, out = new Uint16Array(w * h * 4), toHalf = THREE.DataUtils.toHalfFloat, one = toHalf(1);
  for (let y = 0; y < h; y++) {
    if ((y & 127) === 127) await new Promise(r => setTimeout(r));   // decode in slices so no frame waits on it
    for (let x = 0; x < w; x++) {
      const m = (y * W2 + x) * 4, e = m + w * 4, o = (y * w + x) * 4;
      if (!src[e]) continue;
      const f = 2 ** (src[e] - 136);
      out[o] = toHalf(src[m] * f); out[o + 1] = toHalf(src[m + 1] * f); out[o + 2] = toHalf(src[m + 2] * f); out[o + 3] = src[e + 1] ? one : 0;
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  Object.assign(t, { mapping: THREE.CubeUVReflectionMapping, colorSpace: THREE.LinearSRGBColorSpace, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, needsUpdate: true });
  return t;
}
const PERF_SYNC = /[?&]perf\b/.test(location.search);
// how many of the bottom atoms are still forming out of the steam when the shutter fires (it must match the rendered
// photo); ?late=N tries another count for the next render
const LATE_N = +((location.search.match(/[?&]late=(\d)/) || [])[1] || 3);
// their progress at the shutter, lowest atom least formed
const LATE_GROW = [[0.5], [0.5], [0.35, 0.7], [0.3, 0.55, 0.8]][Math.min(3, LATE_N)];
const N = coarse ? 560 : 820;
// colour slots
// slots 10-13 are a height ramp from the accent toward slate, built from the current accent
const SLOT = { G: 0, L: 1, A: 2, CU: 3, CU2: 4, OK: 5, CLAY: 6, O: 7, N: 8, H: 9, C: 0, R1: 10, R2: 11, R3: 12, R4: 13, BOND: 14, INK: 15, PT: 16, PT2: 17, AU: 18, AU2: 19, Na: 20, B: 21, Al: 22, Sn: 23 };
const PALETTE = ['#5B6578', '#C9CFDA', null, '#B8703F', '#8E5530', '#3FA96B', '#BCC0C7', '#D9553F', '#3D7BFF', '#F2F4F8', 0.35, 0.62, 0.85, 1, '#9AA3B2', 'ink', '#B4BAC4', '#858C98', '#E1B54A', '#B08A2E', '#8A5CE0', ['#E8877F', '#D0645A'], ['#C4A98F', '#9C7F64'], '#5E8F8F'];   // the last is a bond grey that reads on light and dark

const LensShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.007 }, uBlur: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / 800, 1 / 600) }, toneMappingExposure: { value: 0.9 }, uGrain: { value: 0 }, uSeed: { value: 0 }, uGrade: { value: 0 } },
  defines: { ACES_FILMIC_TONE_MAPPING: '', SRGB_TRANSFER: '' },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uAmount; uniform float uBlur; uniform vec2 uTexel; uniform float uGrain; uniform float uSeed; uniform float uGrade; varying vec2 vUv;
    // three.js prepends the tone mapping and colour space functions to every ShaderMaterial
    vec4 tap(vec2 uv, float r) {
      vec4 acc = texture2D(tDiffuse, uv);
      if (r < 0.3) return acc;
      for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; acc += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * uTexel * r); }
      return acc / 9.0;
    }
    void main() {
      vec2 d = vUv - 0.5;
      float edge = max(abs(d.x), abs(d.y)) * 2.0;
      float k = smoothstep(0.45, 1.0, edge);
      vec2 off = d * k * uAmount;
      float r = uBlur * (0.7 + 0.8 * k);
      vec4 cr = tap(vUv + off, r), cg = tap(vUv, r), cb = tap(vUv - off, r);
      vec4 c = vec4(cr.r, cg.g, cb.b, max(max(cr.a, cg.a), cb.a));
      // the finished-render look: a little contrast and saturation, a vignette
      if (uGrade > 0.01) {
        float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
        c.rgb = mix(c.rgb, mix(vec3(l), c.rgb, 1.18), uGrade);
        c.rgb = mix(c.rgb, (c.rgb - 0.5) * 1.1 + 0.5, uGrade * c.a);
        c.rgb *= 1.0 - 0.32 * uGrade * smoothstep(0.35, 1.05, length(d * vec2(1.3, 1.0)) * 1.6);
      }
      // render noise: per-pixel grain that clears as a progressive render converges
      float n = fract(sin(dot(vUv * vec2(1733.0, 917.0) + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb *= mix(1.0, 0.35 + 1.3 * n, uGrain);
      gl_FragColor = c * (1.0 - smoothstep(0.84, 1.0, edge));
      gl_FragColor.rgb = ACESFilmicToneMapping(gl_FragColor.rgb);
      gl_FragColor = sRGBTransferOETF(gl_FragColor);
    }`
};

// out-of-focus blur: a separable gaussian, run once across and once down; the radius eases continuously
const DefocusShader = {
  uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uRadius: { value: 0 }, uTexel: { value: new THREE.Vector2(1 / 800, 1 / 600) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 uDir; uniform float uRadius; uniform vec2 uTexel; varying vec2 vUv;
    void main() {
      vec2 step = uDir * uTexel * (uRadius / 6.0);   // 25 taps over two sigma each side; sigma equals the radius, like CSS blur()
      vec4 acc = vec4(0.0); float wsum = 0.0;
      for (int i = -12; i <= 12; i++) { float x = float(i) / 6.0, w = exp(-0.5 * x * x); acc += texture2D(tDiffuse, vUv + step * float(i)) * w; wsum += w; }
      gl_FragColor = acc / wsum;
    }`
};

function lineOf(list, a, b, n, size, col, skipEnds = false) {
  for (let k = 0; k < n; k++) {
    const t = skipEnds ? (k + 1) / (n + 1) : k / Math.max(1, n - 1);
    list.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, s: size, c: col });
  }
}
function finish(P, rx, ry, rz, meta = {}) {
  const e = new THREE.Euler(rx, ry, rz), v = new THREE.Vector3();
  P.forEach(p => { v.set(p.x, p.y, p.z).applyEuler(e); p.x = v.x; p.y = v.y; p.z = v.z; });
  P.meta = { labels: [], bonds: P.bonds || [], ...meta, euler: e };
  return P;
}
const hidden = (P, n) => { const idx = []; for (let k = 0; k < n; k++) { idx.push(P.length); P.push({ x: 0, y: 0, z: 0, s: 0, c: 2 }); } return idx; };
// a ball-and-stick molecule from [element, x, y, z] atoms and index-pair bonds
// one ball-and-stick convention for every molecule on the page: coordinates in angstrom, 1 A = ANG scene units,
// fixed radii per element and one bond radius; apparent size then comes only from how far the camera is
// metals are the one exception: surface atoms get a near-touching radius (Cu-Cu is 2.55 A) so slabs read as solid
const ANG = 0.36, RADIUS = { H: 0.3, C: 0.45, N: 0.45, O: 0.45, Cu: 1.2, Na: 0.62, B: 0.42, Al: 0.6, Sn: 0.6 }, BOND_R = 0.12;
const rAt = el => (RADIUS[el] || 0.3) * ANG;
// the small molecules that float behind the intro and then take their places in the first skills scene,
// in one order, so the same particles carry over (real geometries, angstrom)
const BG_MOLS = [
  [[['O', 0, 0, 0], ['H', 0.757, 0.586, 0], ['H', -0.757, 0.586, 0]], [[0, 1], [0, 2]]],
  [[['C', 0, 0, 0], ['O', 1.16, 0, 0], ['O', -1.16, 0, 0]], [[0, 1], [0, 2]]],
  [[['N', 0, 0, 0], ['H', 0.94, 0.38, 0], ['H', -0.47, 0.38, 0.81], ['H', -0.47, 0.38, -0.81]], [[0, 1], [0, 2], [0, 3]]],
  [[['C', 0, 0, 0], ['H', 0.63, 0.63, 0.63], ['H', -0.63, -0.63, 0.63], ['H', -0.63, 0.63, -0.63], ['H', 0.63, -0.63, -0.63]], [[0, 1], [0, 2], [0, 3], [0, 4]]],
  [[['C', 0, 0, 0], ['O', 1.43, 0, 0], ['H', 1.75, 0.9, 0], ['H', -0.36, 1.03, 0], ['H', -0.36, -0.51, 0.89], ['H', -0.36, -0.51, -0.89]], [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5]]]
];
const BG_COUNT = () => (window.matchMedia('(pointer: coarse)').matches ? 4 : 5);
function molecule(P, atoms, bonds, at, scale = 1) {
  const k = ANG * scale;
  const idx = atoms.map(([el, x, y, z]) => { P.push({ x: at.x + x * k, y: at.y + y * k, z: at.z + z * k, s: (RADIUS[el] || 0.3) * k, c: SLOT[el] }); return P.length - 1; });
  (P.bonds ||= []);
  bonds.forEach(([a, b]) => P.bonds.push([idx[a], idx[b], BOND_R * k, SLOT.BOND]));
  return idx;
}
// the text the energy surface turns into, split the way a tokenizer would (a leading space belongs to its token)
export const TOKENS = [
  ['sim', 'ulations'],
  ['chem', 'istry'],
  ['ad', 'sorption'],
  ['E', ' ', 'CO', '2']
];
// the illustration subject: a CO molecule above a small copper slab, with a faint dotted path to its landing site
// clay draws everything in plain grey, as the first model of an idea; otherwise the finished, coloured version
function illScene(P, at, k, clay = false) {
  const e = new THREE.Euler(0.55, -0.6, 0), v = new THREE.Vector3(), put = (x, y, z, s, c) => { v.set(x, y, z).applyEuler(e); P.push({ x: at.x + v.x * k, y: at.y + v.y * k, z: at.z + v.z * k, s: s * k, c: clay ? (c === SLOT.CU2 ? SLOT.L : SLOT.CLAY) : c }); };
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) put((i - 2.5) * 0.5, -0.7, (j - 2.5) * 0.5, 0.2, SLOT.CU);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) put((i - 2) * 0.5, -1.05, (j - 2) * 0.5, 0.2, SLOT.CU2);
  for (let d = 0; d < 5; d++) put(0, 0.75 - d * 0.28, 0, 0.035, SLOT.A);
  put(0, 0.95, 0, 0.2, SLOT.C);
  put(0, 1.42, 0, 0.2, SLOT.O);
}
// caffeine (1,3,7-trimethylxanthine) on a 2D skeleton with bond length 1, centred; methyl and C8 hydrogens get depth
const CAF = (() => {
  const a = {
    N1: [0, 1], C2: [-0.866, 0.5], N3: [-0.866, -0.5], C4: [0, -1], C5: [0.866, -0.5], C6: [0.866, 0.5],
    N7: [1.609, -1.169], C8: [1.202, -2.083], N9: [0.207, -1.978],
    O2: [-1.732, 1.0], O6: [1.732, 1.0], M1: [0, 2], M3: [-1.732, -1.0], M7: [2.587, -0.961], H8: [1.577, -2.733]
  };
  const sh = [-0.42, 0.4];
  Object.keys(a).forEach(k => { a[k] = [a[k][0] + sh[0], a[k][1] + sh[1]]; });
  const bonds = [['N1', 'C2'], ['C2', 'N3'], ['N3', 'C4'], ['C4', 'C5'], ['C5', 'C6'], ['C6', 'N1'], ['C5', 'N7'], ['N7', 'C8'], ['C8', 'N9'], ['N9', 'C4'],
    ['C2', 'O2'], ['C6', 'O6'], ['N1', 'M1'], ['N3', 'M3'], ['N7', 'M7'], ['C8', 'H8']];
  const doubles = { 'C2-O2': 1, 'C6-O6': 1, 'C4-C5': 1, 'C8-N9': 1 };
  return { a, bonds, doubles };
})();
const elOf = k => k[0] === 'M' ? 'C' : k[0];
// the model's atoms in a fixed order: the skeleton, then three hydrogens on each methyl (two out of the plane)
const CAF_SC = 1.40 * ANG;   // the skeleton's unit bond is 1.40 A
const CAF_ATOMS = (() => {
  const sc = CAF_SC, out = Object.keys(CAF.a).map(k => ({ el: elOf(k), x: CAF.a[k][0] * sc, y: CAF.a[k][1] * sc, z: 0, key: k, bonded: null }));
  // terminal atoms sit at their real bond lengths from the ring atom they hang on
  const pull = (k, from, len) => { const o = out.find(a => a.key === k), f = out.find(a => a.key === from), dx = o.x - f.x, dy = o.y - f.y, L = Math.hypot(dx, dy); o.x = f.x + dx / L * len * ANG; o.y = f.y + dy / L * len * ANG; };
  pull('O2', 'C2', 1.22); pull('O6', 'C6', 1.22); pull('H8', 'C8', 1.08); pull('M1', 'N1', 1.47); pull('M3', 'N3', 1.47); pull('M7', 'N7', 1.47);
  ['M1', 'M3', 'M7'].forEach(m => {
    const c = out.find(a => a.key === m), from = out.find(a => a.key === (m === 'M1' ? 'N1' : m === 'M3' ? 'N3' : 'N7'));
    const dx = c.x - from.x, dy = c.y - from.y, L = Math.hypot(dx, dy), u = [dx / L, dy / L], n = [-u[1], u[0]], r = 1.09 * ANG;
    [0, 2.094, 4.189].forEach(ph => {
      const px = n[0] * Math.cos(ph), py = n[1] * Math.cos(ph), pz = Math.sin(ph);
      out.push({ el: 'H', x: c.x + r * (u[0] * 0.334 + px * 0.943), y: c.y + r * (u[1] * 0.334 + py * 0.943), z: r * pz * 0.943, key: null, bonded: m, sx: c.x, sy: c.y });
    });
  });
  return out;
})();
// hand-drawn strokes for the skeletal formula: wobbly polylines with a little overshoot, double bonds, N and O letters
// the studio set, shared by the cup sketch and the 3D studio: scale and height of the set, floor level, the cup
const STUDIO_K = CAF_SC / 0.95, STUDIO_Y = -1.3, STUDIO_FLOOR = -2.75, CUP = { x: 0.15, z: 0.5, s: 1.8 };
const CUP_WALL = [[0, 0.02], [0.24, 0.02], [0.26, 0], [0.29, 0], [0.31, 0.05], [0.38, 0.14], [0.44, 0.3], [0.48, 0.5], [0.5, 0.64], [0.515, 0.7], [0.5, 0.705], [0.488, 0.66], [0.468, 0.5], [0.428, 0.3], [0.37, 0.16], [0.3, 0.085], [0, 0.075]];
const CUP_SAUCER = [[0, 0.005], [0.4, 0.005], [0.42, 0], [0.46, 0], [0.5, 0.025], [0.7, 0.05], [0.86, 0.085], [0.88, 0.1], [0.865, 0.1], [0.68, 0.07], [0.36, 0.035], [0, 0.03]];
const cupWorld = (r, h) => [(CUP.x + r * CUP.s) * STUDIO_K, STUDIO_Y + (STUDIO_FLOOR + h * CUP.s) * STUDIO_K];
// a hand sketch of the cup in side view: outline, saucer and three steam squiggles
const CUP_SKETCH = (() => {
  const lines = [], jit = (pts, seed) => pts.map(([x, y], i) => [x + Math.sin(i * 1.7 + seed) * 0.008, y + Math.cos(i * 2.3 + seed) * 0.008]);
  const outer = [[0.36, 0], [0.38, 0.04], [0.43, 0.3], [0.48, 0.62], [0.5, 0.7]];
  [1, -1].forEach((sgn, k) => lines.push(jit(outer.map(([r, h]) => cupWorld(sgn * r, h)), k)));
  const rim = []; for (let t = 0; t <= 24; t++) { const a = t / 24 * Math.PI * 2; rim.push(cupWorld(Math.cos(a) * 0.5, 0.7 + Math.sin(a) * 0.06)); } lines.push(jit(rim, 3));
  const coffee = []; for (let t = 0; t <= 12; t++) { const a = Math.PI + t / 12 * Math.PI; coffee.push(cupWorld(Math.cos(a) * 0.44, 0.66 + Math.sin(a) * 0.035)); } lines.push(jit(coffee, 4));
  lines.push(jit([[-0.36, 0], [0.36, 0]].map(([r, h]) => cupWorld(r, h)), 5));
  const sau = []; for (let t = 0; t <= 24; t++) { const a = t / 24 * Math.PI * 2; sau.push(cupWorld(Math.cos(a) * 0.84, 0.02 + Math.sin(a) * 0.07)); } lines.push(jit(sau, 6));
  for (let k = 0; k < 3; k++) { const st = []; for (let t = 0; t <= 16; t++) { const u = t / 16; st.push(cupWorld((k - 1) * 0.16 + Math.sin(u * 7 + k * 2) * 0.07, 0.85 + u * 0.9)); } lines.push(jit(st, 10 + k)); }
  return lines;
})();
const CAF_SKETCH = (() => {
  const sc = CAF_SC, A = CAF.a, letters = { N1: 'N', N3: 'N', N7: 'N', N9: 'N', O2: 'O', O6: 'O' }, lines = [];
  const pt = k => { const a = CAF_ATOMS.find(x => x.key === k); return [a.x, a.y]; };
  const q0 = CAF_SC / 0.95;
  const stroke = (p, q, seed, wob = 0.02) => {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, n = Math.max(2, Math.round(L / (0.11 * q0)));
    const ph = rand(seed, 121) * 6.3, bow = (rand(seed, 122) - 0.5) * 0.05 * q0, line = [];
    wob *= q0;
    for (let t = 0; t <= n; t++) { const u = t / n, off = Math.sin(u * 6 + ph) * wob + Math.sin(u * Math.PI) * bow; line.push([p[0] + dx * u + nx * off, p[1] + dy * u + ny * off]); }
    lines.push(line);
  };
  CAF.bonds.forEach(([ka, kb], b) => {
    let p = pt(ka), q = pt(kb);
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
    const ca = (letters[ka] ? 0.2 : -0.05) * q0, cb = (letters[kb] ? 0.2 : -0.05) * q0;
    p = [p[0] + ux * ca, p[1] + uy * ca]; q = [q[0] - ux * cb, q[1] - uy * cb];
    stroke(p, q, b);
    if (CAF.doubles[`${ka}-${kb}`]) {
      const five = ka === 'C8', cx = five ? (A.C4[0] + A.C5[0] + A.N7[0] + A.C8[0] + A.N9[0]) / 5 * sc : (A.N1[0] + A.N3[0]) / 2 * sc, cy = five ? (A.C4[1] + A.C5[1] + A.N7[1] + A.C8[1] + A.N9[1]) / 5 * sc : (A.C2[1] + A.C4[1]) / 2 * sc;
      let nx = -uy, ny = ux;
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }
      stroke([p[0] + nx * 0.13 * q0 + ux * 0.12 * q0, p[1] + ny * 0.13 * q0 + uy * 0.12 * q0], [q[0] + nx * 0.13 * q0 - ux * 0.12 * q0, q[1] + ny * 0.13 * q0 - uy * 0.12 * q0], b + 50);
    }
  });
  Object.entries(letters).forEach(([k, ch], m) => {
    const [x, y] = pt(k), w = 0.09 * q0, h = 0.13 * q0;
    if (ch === 'N') { stroke([x - w, y - h], [x - w, y + h], 200 + m, 0.004); stroke([x - w, y + h], [x + w, y - h], 210 + m, 0.004); stroke([x + w, y - h], [x + w, y + h], 220 + m, 0.004); }
    else { const line = []; for (let t = 0; t <= 12; t++) { const a2 = t / 12 * Math.PI * 2 + 0.4; line.push([x + Math.cos(a2) * 0.1 * q0, y + Math.sin(a2) * 0.13 * q0]); } lines.push(line); }
  });
  return lines;
})();
// the 60 vertices of a truncated icosahedron (C60), unit edge about 2
function c60Vertices() {
  const f = (1 + Math.sqrt(5)) / 2, V = [];
  for (const b of [[0, 1, 3 * f], [1, 2 + f, 2 * f], [f, 2, 2 * f + 1]]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const v = [b[0] * sx, b[1] * sy, b[2] * sz];
    for (let r = 0; r < 3; r++) { const p = [v[r % 3], v[(r + 1) % 3], v[(r + 2) % 3]]; if (!V.some(q => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-6)) V.push(p); }
  }
  return V;
}
const PES = (x, z) => 1.4 * (-1.25 * Math.exp(-((x - 1.3) ** 2 + (z - 0.7) ** 2) / 1.3) - 0.85 * Math.exp(-((x + 1.5) ** 2 + (z + 0.9) ** 2) / 0.9)
  + 0.55 * Math.exp(-((x + 0.2) ** 2 + (z - 1.9) ** 2) / 0.8) + 0.22 * Math.sin(x * 1.4) * Math.cos(z * 1.2));

export const MOLS = {
  CO:  { atoms: [['C', 0, 0, 0], ['O', 0, 1.15, 0]], bonds: [[0, 1]], binds: true, h: 1.85, e: -0.62 },
  NH3: { atoms: [['N', 0, 0, 0], ['H', 0.62, 0.38, 0.32], ['H', -0.62, 0.38, 0.32], ['H', 0, 0.38, -0.66]], bonds: [[0, 1], [0, 2], [0, 3]], binds: true, h: 2.1, e: -0.55 },
  CO2: { atoms: [['C', 0, 0, 0], ['O', 1.16, 0, 0], ['O', -1.16, 0, 0]], bonds: [[0, 1], [0, 2]], binds: false, h: 3.1, e: -0.09 },
  N2:  { atoms: [['N', 0.55, 0, 0], ['N', -0.55, 0, 0]], bonds: [[0, 1]], binds: false, desorbs: true, h: 3.2, e: -0.06 },
  // the other way onto the surface (name@atom facing down): the wrong end down binds weakly or not at all
  'CO@O':  { atoms: [['O', 0, 0, 0], ['C', 0, 1.15, 0]], bonds: [[0, 1]], binds: false, h: 2.9, e: -0.11 },
  'NH3@H': { atoms: [['N', 0, 0.38, 0], ['H', 0.62, 0, 0.32], ['H', -0.62, 0, 0.32], ['H', 0, 0, -0.66]], bonds: [[0, 1], [0, 2], [0, 3]], binds: false, h: 2.6, e: -0.08 },
  'CO2@O': { atoms: [['O', 0, 0, 0], ['C', 0, 1.16, 0], ['O', 0, 2.32, 0]], bonds: [[0, 1], [1, 2]], binds: false, desorbs: true, h: 3.3, e: -0.04 },
  'N2@N':  { atoms: [['N', 0, 0, 0], ['N', 0, 1.1, 0]], bonds: [[0, 1]], binds: false, desorbs: true, h: 3.3, e: -0.03 }
};

// the demo's surfaces: lattice, nearest-neighbour distance and layer spacing in A, top and lower layer colours
export const SURFS = {
  Cu100: { lat: '100', a: 2.55, d: 1.80, c: ['CU', 'CU2'] },
  Cu111: { lat: '111', a: 2.55, d: 2.08, c: ['CU', 'CU2'] },
  Pt111: { lat: '111', a: 2.77, d: 2.26, c: ['PT', 'PT2'] },
  Au111: { lat: '111', a: 2.88, d: 2.35, c: ['AU', 'AU2'] }
};
// adsorption on the top site, per molecule variant and surface: [E_ads in eV, distance to the metal atom in A, kind]
// kind: c chemisorbed, p physisorbed, d desorbs. Illustrative values in the right ranges, not computed here
export const ADS = {
  CO:      { Cu100: [-0.62, 1.85, 'c'], Cu111: [-0.55, 1.87, 'c'], Pt111: [-1.45, 1.85, 'c'], Au111: [-0.22, 2.95, 'p'] },
  'CO@O':  { Cu100: [-0.11, 2.90, 'p'], Cu111: [-0.10, 2.95, 'p'], Pt111: [-0.15, 2.80, 'p'], Au111: [0, null, 'd'] },
  NH3:     { Cu100: [-0.55, 2.10, 'c'], Cu111: [-0.50, 2.12, 'c'], Pt111: [-0.85, 2.12, 'c'], Au111: [-0.32, 2.45, 'c'] },
  'NH3@H': { Cu100: [-0.08, 2.60, 'p'], Cu111: [-0.08, 2.62, 'p'], Pt111: [-0.10, 2.55, 'p'], Au111: [-0.05, 2.70, 'p'] },
  CO2:     { Cu100: [-0.09, 3.10, 'p'], Cu111: [-0.08, 3.15, 'p'], Pt111: [-0.12, 3.00, 'p'], Au111: [-0.07, 3.20, 'p'] },
  'CO2@O': { Cu100: [0, null, 'd'], Cu111: [0, null, 'd'], Pt111: [-0.04, 3.30, 'p'], Au111: [0, null, 'd'] },
  N2:      { Cu100: [0, null, 'd'], Cu111: [0, null, 'd'], Pt111: [-0.18, 3.05, 'p'], Au111: [0, null, 'd'] },
  'N2@N':  { Cu100: [0, null, 'd'], Cu111: [0, null, 'd'], Pt111: [-0.35, 1.95, 'c'], Au111: [0, null, 'd'] }
};

// shapes already built, for shapes that derive from another one (the parity plot reads the molecule table)
const forms0 = {};
const SHAPES = {
  // the background behind the intro: a few loose atoms and some larger molecules, seen out of focus
  dust() {
    const P = [], TEMPL = BG_MOLS;
    const spots = [], e = new THREE.Euler(), v = new THREE.Vector3();
    for (let m = 0, tries = 0; m < BG_COUNT() && tries < 2000; tries++) {
      // on wide screens the molecules keep to the open space right of the intro text
      const at = { x: coarse ? (rand(tries, 81) - 0.5) * 16 : -0.5 + rand(tries, 81) * 8.5, y: (rand(tries, 82) - 0.5) * 7.5, z: (rand(tries, 83) - 0.5) * 3 };
      if (spots.some(p => Math.hypot(p.x - at.x, p.y - at.y) < (coarse ? 4.4 : 4.2))) continue;
      spots.push(at);
      const [atoms, bonds] = TEMPL[m % TEMPL.length];
      e.set(rand(m, 84) * 6.3, rand(m, 85) * 6.3, rand(m, 86) * 6.3);
      const rot = atoms.map(([el, x, y, z]) => { v.set(x, y, z).applyEuler(e); return [el, v.x, v.y, v.z]; });
      molecule(P, rot, bonds, at, (2.3 + rand(m, 87) * 0.7) / ANG);   // background only: large, blurred spots
      m++;
    }
    // loose atoms around the molecules
    for (let i = 0, n = coarse ? 18 : 28; i < n; i++) {
      const r = rand(i, 15), el = r < 0.4 ? 'H' : r < 0.7 ? 'C' : r < 0.85 ? 'O' : 'N';
      P.push({ x: (rand(i, 11) - 0.5) * 18, y: (rand(i, 12) - 0.5) * 9, z: (rand(i, 13) - 0.5) * 5, s: el === 'H' ? 0.32 : 0.46, c: el === 'H' ? SLOT.L : SLOT[el] });
    }
    for (let i = P.length; i < N; i++) P.push({ x: (rand(i, 11) - 0.5) * 18, y: (rand(i, 12) - 0.5) * 9, z: (rand(i, 13) - 0.5) * 5, s: 0, c: SLOT.G });
    return finish(P, 0, 0, 0);
  },
  benzene() {
    const P = [], R = 2.4, V = [];
    for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; V.push({ x: R * Math.cos(a), y: R * Math.sin(a), z: 0 }); }
    V.forEach(v => P.push({ ...v, s: 0.26, c: 0 }));
    for (let k = 0; k < 6; k++) lineOf(P, V[k], V[(k + 1) % 6], 16, 0.06, 1, true);
    [0, 2, 4].forEach(k => {
      const a = { x: V[k].x * 0.76, y: V[k].y * 0.76, z: 0 }, b = { x: V[(k + 1) % 6].x * 0.76, y: V[(k + 1) % 6].y * 0.76, z: 0 };
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 };
      lineOf(P, { x: m.x + (a.x - m.x) * 0.75, y: m.y + (a.y - m.y) * 0.75, z: 0 }, { x: m.x + (b.x - m.x) * 0.75, y: m.y + (b.y - m.y) * 0.75, z: 0 }, 12, 0.06, 2);
    });
    V.forEach(v => { const h = { x: v.x * 1.5, y: v.y * 1.5, z: 0 }; lineOf(P, v, h, 7, 0.05, 1, true); P.push({ ...h, s: 0.17, c: 1 }); });
    return finish(P, -0.5, 0.35, 0.1);
  },
  // AI, beat 1: chemistry first, with systems from my own papers in front: the NaBH3- cluster with its Lewis basic
  // sodium anion, B2Al3- with its B-B triple bond, a catenane of two interlocked cyclo[18]carbon rings and the nested
  // [Sn@Cu12@Sn20] cluster, next to a Cu(100) slab with CO on a top site. The small molecules from behind the intro land
  // around them. Everything shares one scale (1 A = 0.36 units) and one ball-and-stick convention.
  aiMols() {
    const P = [], K = ANG;
    P.bonds = [];
    const atom = (el, x, y, z, r) => { P.push({ x, y, z, s: (r ?? RADIUS[el] ?? 0.3) * K, c: el === 'Cu' ? SLOT.CU : SLOT[el] }); return P.length - 1; };
    const mol = (atoms, bonds, at) => molecule(P, atoms, bonds, at);
    const bondAll = (ids, maxA) => { for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = P[ids[i]], b = P[ids[j]]; if (Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < maxA * K) P.bonds.push([ids[i], ids[j], BOND_R * K, SLOT.BOND]); } };
    const turn = (pts, rx, ry, rz) => { const e = new THREE.Euler(rx, ry, rz), v = new THREE.Vector3(); return pts.map(([el, x, y, z]) => { v.set(x, y, z).applyEuler(e); return [el, v.x, v.y, v.z]; }); };
    // first the molecules that floated behind the intro, in the same order, so those very particles land here
    const SPOTS = [{ x: -5.3, y: 2.3, z: -0.5 }, { x: 0.95, y: 2.7, z: -0.6 }, { x: 5.6, y: -2.15, z: -0.2 }, { x: -6.1, y: -2.3, z: -0.5 }, { x: 6.3, y: 2.55, z: -0.8 }];
    BG_MOLS.forEach(([atoms, bonds], k) => mol(atoms, bonds, SPOTS[k]));
    // Cu(100): 4 x 4 top layer, 3 x 3 second layer in the hollows, nearest neighbours 2.55 A apart, layers 1.8 A apart
    const a0 = 2.55, sx = 0.1, sy = -1.75, half = 2 * a0, top = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) top.push(atom('Cu', sx + (i - 1.5) * a0 * K, sy, (j - 1.5) * a0 * K));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) atom('Cu', sx + (i - 1) * a0 * K, sy - 1.8 * K, (j - 1) * a0 * K);
    // the cell box: thin cylinders on its twelve edges, through hidden corner points
    const cy0 = sy - 1.8 * K - 0.9 * K, cy1 = sy + 6.5 * K, c = [];
    for (let k = 0; k < 8; k++) { c.push(P.length); P.push({ x: sx + (k & 1 ? half : -half) * K, y: k & 2 ? cy1 : cy0, z: (k & 4 ? half : -half) * K, s: 0, c: SLOT.G }); }
    [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([u, v]) => P.bonds.push([c[u], c[v], 0.012, SLOT.BOND]));
    // CO standing on a top site: Cu-C 1.85 A, C-O 1.13 A
    const site = top[5];
    mol([['C', 0, 0, 0], ['O', 0, 1.13, 0]], [[0, 1]], { x: P[site].x, y: sy + 1.85 * K, z: P[site].z });
    P.bonds.push([site, P.length - 2, BOND_R * K, SLOT.BOND]);
    // NaBH3-: Na-B 2.6 A, B-H 1.22 A, the hydrogens bent away from the sodium (Na-B-H 105 degrees)
    const hb = 105 * Math.PI / 180, nab = [['B', 0, 0, 0], ['Na', 0, 2.6, 0]];
    for (let q = 0; q < 3; q++) { const t = q * 2 * Math.PI / 3; nab.push(['H', 1.22 * Math.sin(hb) * Math.cos(t), 1.22 * Math.cos(hb), 1.22 * Math.sin(hb) * Math.sin(t)]); }
    mol(turn(nab, 0.15, 0.4, -0.35), [[0, 1], [0, 2], [0, 3], [0, 4]], { x: -1.95, y: 2.05, z: 2.1 });
    // B2Al3-: the B-B triple bond (1.49 A) on the axis of a trigonal bipyramid, three Al around it at 2.1 A from each B
    const bal = [['B', 0, 0.745, 0], ['B', 0, -0.745, 0]];
    for (let q = 0; q < 3; q++) { const t = q * 2 * Math.PI / 3; bal.push(['Al', 1.96 * Math.cos(t), 0, 1.96 * Math.sin(t)]); }
    mol(turn(bal, 0.5, 0.3, 1.1), [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4]], { x: 3.35, y: -2.5, z: 1.2 });
    // two cyclo[18]carbon rings (radius 3.68 A) linked like a chain: each passes through the middle of the other
    const R18 = 3.68, cat = [];
    for (let q = 0; q < 18; q++) { const t = q * Math.PI / 9; cat.push(['C', R18 * Math.cos(t) - R18 / 2, R18 * Math.sin(t), 0]); }
    for (let q = 0; q < 18; q++) { const t = q * Math.PI / 9 + Math.PI / 18; cat.push(['C', R18 / 2 + R18 * Math.cos(t), 0, R18 * Math.sin(t)]); }
    const cb = []; for (let q = 0; q < 18; q++) cb.push([q, (q + 1) % 18], [18 + q, 18 + (q + 1) % 18]);
    mol(turn(cat, 0.6, 0.35, 0.2), cb, { x: -4.0, y: -0.85, z: -0.3 });
    // [Sn@Cu12@Sn20]: a tin atom inside a Cu12 icosahedron (Sn-Cu 2.65 A) inside a Sn20 dodecahedron (4.4 A out),
    // each copper under the middle of a pentagon of tin; the shells are drawn by their own edges
    const f = (1 + Math.sqrt(5)) / 2, ico = [], dod = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) { ico.push([0, a * f, b], [a * f, b, 0], [a, 0, b * f]); dod.push([0, a / f, b * f], [a / f, b * f, 0], [a * f, 0, b / f]); }
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) dod.push([a, b, d]);
    const mAt = { x: 4.45, y: 0.95, z: -0.55 }, mE = new THREE.Euler(0.35, 0.5, 0.1), mv = new THREE.Vector3();
    const put = (el, v, r, rad) => { mv.set(v[0], v[1], v[2]).normalize().multiplyScalar(r).applyEuler(mE); return atom(el, mAt.x + mv.x * K, mAt.y + mv.y * K, mAt.z + mv.z * K, rad); };
    atom('Sn', mAt.x, mAt.y, mAt.z, 0.6);
    const cu = ico.map(v => put('Cu', v, 2.65, 0.5)), sn = dod.map(v => put('Sn', v, 4.4, 0.6));
    bondAll(cu, 2.9); bondAll(sn, 3.3);
    // the busy middle is framed as before; the molecules around it may run past the frame
    return finish(P, 0.25, -0.3, 0, { mol: 'systems', frame: { x: 7.1, y: 3.67 } });
  },
  // AI, beat 3: the energy surface becomes text, the way a tokenizer splits it (words and parts of words), with a
  // machine-learned interatomic potential (MLIP) below. The page draws the real token text over the particle blocks.
  aiNet() {
    const P = [], local = [], nodes = [], edges = [], layers = [5, 7, 7, 3], xs = [-1.5, -0.5, 0.5, 1.5], yc = -1.45;
    layers.forEach((n, l) => {
      const ids = [];
      for (let k = 0; k < n; k++) { const p = { x: xs[l], y: yc + (k - (n - 1) / 2) * 0.32, z: 0 }; ids.push(P.length); local[P.length] = p; P.push({ ...p, s: l === 3 ? 0.15 : 0.1, c: l === 3 ? SLOT.A : SLOT.G }); }
      nodes.push(ids);
    });
    for (let l = 0; l < layers.length - 1; l++) nodes[l].forEach(a => nodes[l + 1].forEach(b => edges.push([a, b])));
    // token blocks: one block of beads per token, widths in proportion to its characters (a monospace layout)
    const CW = 0.19, ROW = 0.42, GAP = 0.05, colours = [SLOT.A, SLOT.N, SLOT.OK, SLOT.R2], tokens = [];
    const lines = TOKENS.map(l => l.reduce((w, t) => w + t.length * CW + GAP, -GAP));
    TOKENS.forEach((line, r) => {
      let x = -Math.max(...lines) / 2;
      const y = 2.25 - r * ROW;
      line.forEach(t => {
        const w = t.length * CW, cols = Math.max(2, Math.round(w / 0.1)), beads = [];
        for (let j = 0; j < 2; j++) for (let i = 0; i < cols; i++) { beads.push(P.length); P.push({ x: x + (i + 0.5) * (w / cols), y: y - 0.08 - j * 0.14, z: 0, s: 0.045, c: colours[tokens.length % colours.length] }); }
        tokens.push({ text: t, beads, x0: x, x1: x + w, y0: y, y1: y - 0.3, colour: tokens.length % colours.length });
        x += w + GAP;
      });
    });
    // two anchor particles per token mark the block corners, so the page can place the text exactly
    tokens.forEach(t => { t.a = P.length; P.push({ x: t.x0, y: t.y0, z: 0, s: 0, c: SLOT.G }); t.b = P.length; P.push({ x: t.x1, y: t.y1, z: 0, s: 0, c: SLOT.G }); });
    return finish(P, 0, 0, 0, { nodes, edges, local, tokens, xs, pulse: -1, revealed: 0 });
  },
  // AI, beat 3: the energy surface breaks apart and its particles become words, split into tokens the way a
  // language model reads them; tokens are told apart by colour only. Drawn from the site's mono font.
  aiText() {
    const cv = document.createElement('canvas'), g = cv.getContext('2d', { willReadFrequently: true });
    const font = '600 40px "Roboto Mono", ui-monospace, Menlo, monospace';
    g.font = font;
    const lineH = 48, widths = TOKENS.map(l => g.measureText(l.join('')).width), W0 = Math.ceil(Math.max(...widths)) + 8, H0 = lineH * TOKENS.length + 8;
    cv.width = W0; cv.height = H0;
    // one colour per token: draw each token in its own colour index, read the index back per pixel
    g.font = font; g.textBaseline = 'top';
    TOKENS.forEach((line, r) => { let x = 4; line.forEach((t, k) => { g.fillStyle = `rgb(${(r * 8 + k + 1) * 6},0,0)`; g.fillText(t, x, 4 + r * lineH); x += g.measureText(t).width; }); });
    const data = g.getImageData(0, 0, W0, H0).data, budget = Math.floor(N * 0.92);
    const sample = step => { const pts = []; for (let y = 0; y < H0; y += step) for (let x = 0; x < W0; x += step) { const o = (Math.floor(y) * W0 + Math.floor(x)) * 4; if (data[o + 3] > 140) pts.push([x, y, Math.round(data[o] / 6) - 1]); } return pts; };
    let step = 2.2, pts = sample(step);
    while (pts.length > budget) { step += 0.15; pts = sample(step); }
    const scale = 7.2 / W0;
    const P = pts.map(([x, y, id]) => {
      const r = Math.floor(id / 8), k = id % 8;
      // tokens alternate slate and accent along each line, as a tokenizer view colours them
      return { x: (x - W0 / 2) * scale, y: (H0 / 2 - y) * scale, z: 0, s: step * scale * 0.5, c: k % 2 === 0 ? SLOT.G : SLOT.A };
    });
    // the surface flies apart on the way in
    return finish(P, 0.04, -0.14, 0, { burst: 2.6 });
  },
  // AI, beat 2: a dense learned energy surface
  aiPes() {
    const P = [], n = coarse ? 23 : 28, L = 6.6;
    let lo = Infinity, hi = -Infinity;
    const grid = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -L / 2 + L * i / (n - 1), z = -L / 2 + L * j / (n - 1), y = PES(x, z);
      lo = Math.min(lo, y); hi = Math.max(hi, y); grid.push({ x, y, z });
    }
    const ramp = t => t < 0.2 ? SLOT.A : t < 0.36 ? SLOT.R1 : t < 0.52 ? SLOT.R2 : t < 0.7 ? SLOT.R3 : SLOT.R4;
    const cols = grid.map(g => ramp((g.y - lo) / (hi - lo))), xn = grid.map(g => (g.x + L / 2) / L);
    grid.forEach((g, k) => P.push({ ...g, s: coarse ? 0.055 : 0.045, c: cols[k] }));
    return finish(P, 0.5, -0.5, 0, { grid, cols, xn, size: coarse ? 0.055 : 0.045 });
  },
  viz() {
    const P = [];
    [[-1.15, 'xy', 0], [1.15, 'xz', 2]].forEach(([cx, ax, col]) => {
      const pts = [];
      for (let k = 0; k < 18; k++) {
        const a = k * 2 * Math.PI / 18, r = 2.2;
        pts.push(ax === 'xy' ? { x: cx + Math.cos(a) * r, y: Math.sin(a) * r, z: 0 } : { x: cx + Math.cos(a) * r, y: 0, z: Math.sin(a) * r });
      }
      pts.forEach((p, k) => { P.push({ ...p, s: 0.24, c: col === 2 ? 2 : 0 }); lineOf(P, p, pts[(k + 1) % 18], 4, 0.06, col === 2 ? 2 : 1, true); });
    });
    return finish(P, 0.35, -0.5, 0.1);
  },
  // up to four small metal slabs, each in its own periodic cell, laid out as systems batched on one GPU. The slab atoms
  // are slots here; the demo controller builds the cells (surface, lattice, position) for each batch at run time.
  // This starting layout (one Cu(100) cell per slot, 2 x 2) only seeds the slots
  demo() {
    const P = [], a = 2.55 * ANG, d = 1.8 * ANG, slabs = [], half = 2.5 * a, G = 5 * a + 1.4, cells = [];
    [[-G / 2, -G / 2], [G / 2, -G / 2], [-G / 2, G / 2], [G / 2, G / 2]].forEach(([ox, oz]) => {
      const ids = [];
      for (let L = 0; L < 3; L++) for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        ids.push(P.length);
        P.push({ x: ox + (i - 2) * a, y: -L * d, z: oz + (j - 2) * a, s: rAt('Cu'), c: L ? SLOT.CU2 : SLOT.CU });
      }
      slabs.push(ids);
      cells.push({ min: [ox - half, -2 * d - 0.9 * ANG, oz - half], max: [ox + half, 9.5 * ANG, oz + half] });
    });
    const atoms = [0, 1, 2, 3].map(() => hidden(P, 4)), beads = hidden(P, 6);
    const cell = { min: [0, 1, 2].map(k => Math.min(...cells.map(c => c.min[k]))), max: [0, 1, 2].map(k => Math.max(...cells.map(c => c.max[k]))) };
    return finish(P, 0.42, -0.62, 0, { slabs, atoms, beads, cell, cells, mol: 'systems', still: true });
  },
  // illustration, step 1: a messy cloud organises into a matrix, nodes joined by thin cylinders
  illMatrix() {
    const P = [], ids = {}, s = 0.85, NX = 6, NY = 4, NZ = 3;
    P.bonds = [];
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) {
      ids[`${i},${j},${k}`] = P.length;
      P.push({ x: (i - (NX - 1) / 2) * s, y: (j - (NY - 1) / 2) * s, z: (k - (NZ - 1) / 2) * s, s: 0.075, c: (i + j + k) % 5 === 0 ? SLOT.A : SLOT.L });
    }
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) {
      const a = ids[`${i},${j},${k}`];
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(([di, dj, dk]) => { const b = ids[`${i + di},${j + dj},${k + dk}`]; if (b !== undefined) P.bonds.push([a, b, 0.016, SLOT.G]); });
    }
    return finish(P, 0.38, -0.55, 0, { burst: 2.4, still: true });
  },
  // illustration: a table whose cells hold small molecules instead of values
  illGrid() {
    const P = [], cols = 6, rows = 4, cw = 1.15, ch = 0.95, W = cols * cw, Hh = rows * ch, K = 0.26, mols = [];
    P.bonds = [];
    const line = (x0, y0, x1, y1) => { const a = P.length; P.push({ x: x0, y: y0, z: 0, s: 0, c: SLOT.G }, { x: x1, y: y1, z: 0, s: 0, c: SLOT.G }); P.bonds.push([a, a + 1, 0.011, SLOT.BOND]); };
    for (let i = 0; i <= cols; i++) line(-W / 2 + i * cw, -Hh / 2, -W / 2 + i * cw, Hh / 2);
    for (let j = 0; j <= rows; j++) line(-W / 2, -Hh / 2 + j * ch, W / 2, -Hh / 2 + j * ch);
    const T = [
      [[['O', 0, 0, 0], ['H', 0.76, 0.59, 0], ['H', -0.76, 0.59, 0]], [[0, 1], [0, 2]]],
      [[['C', -0.56, 0, 0], ['O', 0.57, 0, 0]], [[0, 1]]],
      [[['C', 0, 0, 0], ['O', 1.16, 0, 0], ['O', -1.16, 0, 0]], [[0, 1], [0, 2]]],
      [[['N', 0, 0, 0], ['H', 0.94, 0.38, 0], ['H', -0.47, 0.38, 0.81], ['H', -0.47, 0.38, -0.81]], [[0, 1], [0, 2], [0, 3]]],
      [[['C', 0, 0, 0], ['H', 0.63, 0.63, 0.63], ['H', -0.63, -0.63, 0.63], ['H', -0.63, 0.63, -0.63], ['H', 0.63, -0.63, -0.63]], [[0, 1], [0, 2], [0, 3], [0, 4]]],
      [[['C', -0.7, 0, 0], ['O', 0.7, 0, 0], ['H', 1.0, 0.9, 0], ['H', -1.06, 1.0, 0]], [[0, 1], [1, 2], [0, 3]]],
      [[['N', -0.55, 0, 0], ['N', 0.55, 0, 0]], [[0, 1]]],
      [[['C', 0, 0, 0], ['O', 0, 1.2, 0], ['H', 0.94, -0.59, 0], ['H', -0.94, -0.59, 0]], [[0, 1], [0, 2], [0, 3]]]
    ];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const [atoms, bonds] = T[(i + j * 3) % T.length], cx = -W / 2 + (i + 0.5) * cw, cy = Hh / 2 - (j + 0.5) * ch;
      const ids = atoms.map(([el, x, y, z]) => { P.push({ x: cx + x * K, y: cy + y * K, z: z * K, s: (el === 'H' ? 0.2 : 0.3) * K, c: SLOT[el] }); return P.length - 1; });
      bonds.forEach(([a, b]) => P.bonds.push([ids[a], ids[b], 0.1 * K, SLOT.BOND]));
      mols.push(ids);
    }
    return finish(P, 0.06, -0.14, 0, { burst: 1.6, mols, cols, rows });
  },
  // the same particles as a parity plot: each molecule collapses to one point; two grid lines become the axes,
  // one the diagonal, the rest tick marks
  illParity() {
    const g = forms0.illGrid, P = [], cols = g.meta.cols, rows = g.meta.rows;
    P.bonds = [];
    const X0 = -2.0, X1 = 2.0, Y0 = -1.6, Y1 = 1.6;
    const seg = (x0, y0, x1, y1, r, c) => { const a = P.length; P.push({ x: x0, y: y0, z: 0, s: 0, c: SLOT.G }, { x: x1, y: y1, z: 0, s: 0, c: SLOT.G }); P.bonds.push([a, a + 1, r, c]); };
    for (let i = 0; i <= cols; i++) {
      if (i === 0) seg(X0, Y0, X0, Y1 + 0.1, 0.014, SLOT.BOND);
      else if (i === cols) seg(X0, Y0, X1, Y1, 0.012, SLOT.A);
      else { const x = X0 + (X1 - X0) * i / cols; seg(x, Y0, x, Y0 - 0.1, 0.01, SLOT.BOND); }
    }
    for (let j = 0; j <= rows; j++) {
      if (j === 0) seg(X0, Y0, X1 + 0.1, Y0, 0.014, SLOT.BOND);
      else { const y = Y0 + (Y1 - Y0) * j / (rows + 0.6); seg(X0, y, X0 - 0.1, y, 0.01, SLOT.BOND); }
    }
    g.meta.mols.forEach((ids, m) => {
      const n = g.meta.mols.length, ref = (m + 0.5) / n, err = (rand(m, 131) + rand(m, 132) - 1) * 0.16;
      const x = X0 + 0.15 + ref * (X1 - X0 - 0.3), y = Y0 + 0.15 + (ref + err) * (Y1 - Y0 - 0.3);
      ids.forEach((id, k) => P.push({ x, y, z: 0, s: k === 0 ? 0.075 : 0, c: Math.abs(err) > 0.1 ? SLOT.A : SLOT.G }));
    });
    return finish(P, 0.06, -0.14, 0, { calm: true, still: true });
  },
  // a hand sketch of caffeine in real lines; its atoms wait, unseen, exactly where the model will grow them
  illSketch() {
    const P = [];
    P.bonds = [];
    CAF_ATOMS.forEach(a => P.push({ x: a.bonded ? a.sx : a.x, y: a.bonded ? a.sy : a.y, z: 0, s: 0, c: SLOT.INK }));
    // each stroke point is a dot as wide as the line, so the segments meet in round joins like a pencil line
    CAF_SKETCH.concat(CUP_SKETCH).forEach(line => { let prev = -1; line.forEach(([x, y]) => { const i = P.length; P.push({ x, y, z: 0, s: 0.013, c: SLOT.INK }); if (prev >= 0) P.bonds.push([prev, i, 0.013, SLOT.INK]); prev = i; }); });
    return finish(P, 0, 0, 0, { still: true, mol: 'caffeine' });
  },
  // the same molecule as a ball-and-stick model, grown in place from the sketch: plain clay first, then colour,
  // light and a turn to a better angle (the controller)
  illModel() {
    const P = [], idx = {}, base = [];
    P.bonds = [];
    CAF_ATOMS.forEach((a, i) => { if (a.key) idx[a.key] = i; P.push({ x: a.x, y: a.y, z: a.z, s: rAt(a.el), c: SLOT.CLAY }); base.push(a.el); });
    CAF.bonds.forEach(([a, b]) => P.bonds.push([idx[a], idx[b], BOND_R * ANG, SLOT.BOND]));
    CAF_ATOMS.forEach((a, i) => { if (a.bonded) P.bonds.push([idx[a.bonded], i, BOND_R * ANG, SLOT.BOND]); });
    // the sketch line points stay where they were, unseen, so nothing flies across the screen
    CAF_SKETCH.forEach(line => line.forEach(([x, y]) => P.push({ x, y, z: 0, s: 0, c: SLOT.INK })));
    const local = P.slice(0, CAF_ATOMS.length).map(p => ({ x: p.x, y: p.y, z: p.z }));
    return finish(P, 0, 0, 0, { local, base, calm: true, mol: 'caffeine' });
  },
  // illustration, beat 1: the idea, a molecule about to land on a surface, as a plain clay model
  illIdea() {
    const P = [];
    illScene(P, { x: 0, y: 0, z: 0 }, 1, true);
    return finish(P, 0, 0, 0);
  },
  // illustration, beat 2: the same idea in three forms, side by side: a 3D render, a 2D slide, an animation strip
  illForms() {
    const P = [], bead = coarse ? 0.12 : 0.09;
    // 3D render, left: the clay model finished with materials and colour
    illScene(P, { x: -2.55, y: 0.15, z: 0 }, 0.58);
    // 2D slide, centre: a 16:9 frame, a title line, a row of surface atoms, the molecule and an arrow
    const fw = 2.2, fh = fw * 9 / 16, cx = 0.05, cy = 0.15;
    const corner = [[cx - fw / 2, cy + fh / 2], [cx + fw / 2, cy + fh / 2], [cx + fw / 2, cy - fh / 2], [cx - fw / 2, cy - fh / 2]];
    corner.forEach((p, k) => { const q = corner[(k + 1) % 4]; lineOf(P, { x: p[0], y: p[1], z: 0 }, { x: q[0], y: q[1], z: 0 }, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / bead), 0.028, SLOT.G); });
    lineOf(P, { x: cx - fw / 2 + 0.18, y: cy + fh / 2 - 0.18, z: 0 }, { x: cx - 0.25, y: cy + fh / 2 - 0.18, z: 0 }, 8, 0.03, SLOT.L);
    for (let k = 0; k < 8; k++) P.push({ x: cx - 0.77 + k * 0.22, y: cy - 0.33, z: 0, s: 0.09, c: SLOT.CU });
    P.push({ x: cx - 0.08, y: cy + 0.2, z: 0, s: 0.08, c: SLOT.C }, { x: cx + 0.08, y: cy + 0.2, z: 0, s: 0.08, c: SLOT.O });
    lineOf(P, { x: cx, y: cy + 0.07, z: 0 }, { x: cx, y: cy - 0.18, z: 0 }, 5, 0.022, SLOT.A);
    P.push({ x: cx - 0.05, y: cy - 0.13, z: 0, s: 0.022, c: SLOT.A }, { x: cx + 0.05, y: cy - 0.13, z: 0, s: 0.022, c: SLOT.A });
    // animation strip, right: four keyframes in a 2 x 2 contact sheet, the molecule lower in each, earlier positions faint
    const sw = 1.0, sh = 0.56, frames = [], heights = [0.3, 0.2, 0.12, 0.05], ox = 2.65, oy = 0.15;
    heights.forEach((h, f) => {
      const fx = ox + (f % 2 ? 0.56 : -0.56), fy = oy + (f < 2 ? 0.33 : -0.33), out = [], base = fy - 0.16;
      const C = [[fx - sw / 2, fy + sh / 2], [fx + sw / 2, fy + sh / 2], [fx + sw / 2, fy - sh / 2], [fx - sw / 2, fy - sh / 2]];
      C.forEach((p, k) => { const q = C[(k + 1) % 4]; const n = Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / bead); for (let j = 0; j < n; j++) { out.push(P.length); P.push({ x: p[0] + (q[0] - p[0]) * j / n, y: p[1] + (q[1] - p[1]) * j / n, z: 0, s: 0.022, c: SLOT.G }); } });
      for (let k = 0; k < 5; k++) P.push({ x: fx - 0.32 + k * 0.16, y: base, z: 0, s: 0.055, c: SLOT.CU });
      for (let g = 0; g < f; g++) P.push({ x: fx, y: base + 0.1 + heights[g], z: 0, s: 0.035, c: SLOT.L });
      const mol = P.length;
      P.push({ x: fx - 0.045, y: base + 0.1 + h, z: 0, s: 0.05, c: SLOT.C }, { x: fx + 0.045, y: base + 0.1 + h, z: 0, s: 0.05, c: SLOT.O });
      frames.push({ out, mol });
    });
    // still: drawn frames and slides should not float like particles do
    return finish(P, 0, -0.06, 0, { frames, still: true });
  },
  // the illustration grid: six tiles, each a small mosaic of particles that the page colours with the
  // pixels of a real image, so the particles assemble the pictures before the sharp images take over
  vizGrid() {
    const P = [], cols = 3, rows = 2, w = 3.0, h = 2.1, g = 0.35, GW = cols * w + (cols - 1) * g, GH = rows * h + (rows - 1) * g;
    const mc = coarse ? 10 : 13, mr = coarse ? 7 : 9, tiles = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x0 = -GW / 2 + c * (w + g), y0 = GH / 2 - r * (h + g), dx = w / mc, dy = h / mr;
      tiles.push({ start: P.length });
      for (let j = 0; j < mr; j++) for (let i = 0; i < mc; i++) P.push({ x: x0 + (i + 0.5) * dx, y: y0 - (j + 0.5) * dy, z: 0, s: Math.min(dx, dy) * 0.47, c: SLOT.L });
    }
    // a slight tilt, so the grid reads as objects in space rather than a flat sheet
    return finish(P, -0.07, -0.22, 0, { aspect: GW / GH, tiles, mc, mr });
  },
  // a clean parity plot: two axes, the y = x diagonal, data points
  bench() {
    const P = [], A = 1.9;
    lineOf(P, { x: -A, y: -A, z: 0 }, { x: A, y: -A, z: 0 }, 18, 0.04, SLOT.G); const xEnd = P.length - 1;
    lineOf(P, { x: -A, y: -A, z: 0 }, { x: -A, y: A, z: 0 }, 18, 0.04, SLOT.G); const yEnd = P.length - 1;
    lineOf(P, { x: -A, y: -A, z: 0 }, { x: A, y: A, z: 0 }, 30, 0.05, SLOT.A);
    const pts = hidden(P, 46);
    const ref = pts.map((_, k) => -1.6 + 3.2 * ((k + 0.5) / pts.length) + (rand(k, 31) - 0.5) * 0.08);
    const noise = pts.map((_, k) => (rand(k, 33) + rand(k, 34) + rand(k, 35) - 1.5) * 1.4);
    return finish(P, 0.1, -0.28, 0, { pts, ref, noise, labels: [{ text: 'reference', i: xEnd }, { text: 'predicted', i: yEnd }] });
  },
  // a lecture room: a slide on a screen and raked rows of seats, some taken; drawn with fuller strokes so it holds up
  // next to the other scenes
  learn() {
    const P = [], W = 4.2, H = 2.36, sy = 1.5, sz = -2.4;
    const c = [[-W / 2, sy - H / 2], [W / 2, sy - H / 2], [W / 2, sy + H / 2], [-W / 2, sy + H / 2]];
    c.forEach((p, k) => { const q = c[(k + 1) % 4]; lineOf(P, { x: p[0], y: p[1], z: sz }, { x: q[0], y: q[1], z: sz }, k % 2 ? 12 : 20, 0.1, SLOT.G); });
    lineOf(P, { x: -1.6, y: sy + 0.78, z: sz }, { x: 0.3, y: sy + 0.78, z: sz }, 12, 0.12, SLOT.G);
    for (let k = 0; k < 18; k++) { const t = k / 17; P.push({ x: -1.6 + t * 3.2, y: sy - 0.75 + 1.15 * (1 - Math.exp(-3 * t)), z: sz, s: 0.14, c: SLOT.A }); }
    // rows of seats facing the screen, seen from above; taken seats in the accent
    for (let r = 0; r < 4; r++) {
      const n = 8 + r * 2, rad = 3.0 + r * 1.0;
      for (let k = 0; k < n; k++) {
        const a = (k - (n - 1) / 2) * (1.3 / (n - 1)), taken = rand(r * 13 + k, 41) < 0.45;
        P.push({ x: Math.sin(a) * rad, y: -1.5, z: sz + Math.cos(a) * rad, s: taken ? 0.27 : 0.18, c: taken ? SLOT.A : SLOT.G });
      }
    }
    return finish(P, 0.62, -0.25, 0);
  },
  // the first, thinner lecture room, kept for comparison (not in the sequence)
  learnThin() {
    const P = [], W = 4.2, H = 2.36, sy = 1.5, sz = -2.4;
    const c = [[-W / 2, sy - H / 2], [W / 2, sy - H / 2], [W / 2, sy + H / 2], [-W / 2, sy + H / 2]];
    c.forEach((p, k) => { const q = c[(k + 1) % 4]; lineOf(P, { x: p[0], y: p[1], z: sz }, { x: q[0], y: q[1], z: sz }, k % 2 ? 9 : 15, 0.05, SLOT.G); });
    lineOf(P, { x: -1.6, y: sy + 0.78, z: sz }, { x: 0.3, y: sy + 0.78, z: sz }, 9, 0.06, SLOT.G);
    for (let k = 0; k < 14; k++) { const t = k / 13; P.push({ x: -1.6 + t * 3.2, y: sy - 0.75 + 1.15 * (1 - Math.exp(-3 * t)), z: sz, s: 0.08, c: SLOT.A }); }
    // rows of seats facing the screen, seen from above; taken seats in the accent
    for (let r = 0; r < 4; r++) {
      const n = 8 + r * 2, rad = 3.0 + r * 1.0;
      for (let k = 0; k < n; k++) {
        const a = (k - (n - 1) / 2) * (1.3 / (n - 1)), taken = rand(r * 13 + k, 41) < 0.45;
        P.push({ x: Math.sin(a) * rad, y: -1.5, z: sz + Math.cos(a) * rad, s: taken ? 0.21 : 0.13, c: taken ? SLOT.A : SLOT.G });
      }
    }
    return finish(P, 0.62, -0.25, 0);
  },
  c60() {
    const V = c60Vertices();
    const P = V.map(v => ({ x: v[0] * 0.55, y: v[1] * 0.55, z: v[2] * 0.55, s: 0.2, c: 0 })), A = P.slice();
    for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) if (Math.hypot(A[i].x - A[j].x, A[i].y - A[j].y, A[i].z - A[j].z) < 1.15) lineOf(P, A[i], A[j], 2, 0.05, 1, true);
    return finish(P, 0.4, 0.3, 0);
  }
};
// the out-of-focus atoms zoom straight into the first AI scene
// the molecule table and parity plot (illGrid, illParity) are kept but out of the sequence for now
export const ORDER = ['dust', 'aiMols', 'aiPes', 'illSketch', 'illModel', 'demo', 'learn'];

export function initReel(canvas, readAccent) {
  // the accent comes from CSS once and again only when the root's style changes, so frames never force a style recalc
  let accentNow = readAccent();
  new MutationObserver(() => { accentNow = readAccent(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  const getAccent = () => accentNow;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' }); } catch (e) { return null; }
  // with no usable GPU the browser draws WebGL on the CPU (SwiftShader, llvmpipe): then use the lightest settings
  const glInfo = (() => { try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return ''; } })();
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(glInfo);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  const scene = new THREE.Scene();
  // filtering the room here is the fallback if the baked file cannot load; only then is the room's module fetched
  const envReady = loadRoomEnv().then(t => { scene.environment = t; }, () => import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => { scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; }));
  const hemi = new THREE.HemisphereLight(0xffffff, 0x7a8396, 0.6); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(5, 10, 8); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffe2cc, 0.6); rim.position.set(-8, 3, -6); scene.add(rim);
  // the illustration's viewport preview looks like Blender's solid view: a grey clay matcap, no lights, shadows or
  // reflections, so it costs little; the finished look comes with the rendered photo
  const MATCAP = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#4a4d52'; g.fillRect(0, 0, 256, 256);
    const sph = g.createRadialGradient(112, 100, 20, 128, 128, 128);
    sph.addColorStop(0, '#e2e3e5'); sph.addColorStop(0.45, '#c8cbcf'); sph.addColorStop(0.8, '#a4a8ae'); sph.addColorStop(0.96, '#878b92'); sph.addColorStop(1, '#73777e');
    g.fillStyle = sph; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
    // a soft bounce from below, as in Blender's studio matcaps
    const b = g.createRadialGradient(150, 236, 4, 150, 236, 90);
    b.addColorStop(0, 'rgba(200,204,210,0.35)'); b.addColorStop(1, 'rgba(200,204,210,0)');
    g.fillStyle = b; g.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const clayMat = (opts = {}) => { const { roughness, metalness, envMapIntensity, ...o } = opts; return new THREE.MeshMatcapMaterial({ matcap: MATCAP, ...o }); };
  // the particles keep their lit material for every other scene and blend to the matcap in the illustration
  const clayU = { uMatcap: { value: MATCAP }, uClay: { value: 0 }, uSketch: { value: 0 }, uPaper: { value: new THREE.Color() } };
  // far enough for the demo's long lens, which backs the camera off three times its usual distance
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 700);
  scene.add(camera);
  // the illustration photo dissolving: the rendered image as soft points on the plane of the camera's view (the same
  // 16:10 frame the photo covers), each with the colour of its patch; as the scroll moves on they drift apart, rise,
  // glow and fade. One draw call; the material exists from the start so warm-up compiles it
  const dis = (() => {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uP: { value: 0 }, uD: { value: 15 }, uCell: { value: 10 }, uTan: { value: Math.tan(THREE.MathUtils.degToRad(15)) } },
      vertexShader: `attribute vec3 aCol; attribute vec4 aSeed; uniform float uP, uD, uCell, uTan; varying vec3 vCol; varying float vA, vQ;
        void main() {
          // aSeed.w is the moment (0..1 of the dissolve) this point's cell leaves the photo; until then it stays hidden
          float st = aSeed.w * 0.6, h = 2.0 * uD * uTan, w = 1.6 * h, q = clamp((uP - st) / 0.42, 0.0, 1.0), go = q * q;
          float ang = aSeed.x * 6.2832;
          vec3 p = vec3(position.x * w, position.y * h, -uD);
          p += vec3(cos(ang), sin(ang) * 0.7, (aSeed.z - 0.5) * 0.6) * go * h * 0.34;
          p.y += uP * uP * h * 0.12;
          p.x += sin(aSeed.y * 40.0 + uP * 7.0) * q * h * 0.012;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          // born as its own square of the photo (slightly brighter, to make up for the scene's tone mapping), it
          // rounds off, softens and glows as it drifts
          gl_PointSize = uCell * (1.04 + 1.6 * q);
          vCol = aCol * (1.3 + 0.7 * q); vQ = q;
          vA = position.z * smoothstep(st, st + 0.015, uP) * pow(1.0 - q, 1.4);
        }`,
      fragmentShader: `varying vec3 vCol; varying float vA, vQ;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float r = length(c);
          float sq = step(max(abs(c.x), abs(c.y)), 0.5), round = exp(-r * r * 9.0) * smoothstep(0.5, 0.28, r);
          float a = mix(sq, round, smoothstep(0.0, 0.25, vQ)) * vA; if (a < 0.004) discard; gl_FragColor = vec4(vCol * a, a); }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
    });
    const geo0 = new THREE.BufferGeometry();
    geo0.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geo0.setAttribute('aCol', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geo0.setAttribute('aSeed', new THREE.Float32BufferAttribute([0, 0, 0, 0], 4));
    const pts = new THREE.Points(geo0, mat);
    pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 10;
    camera.add(pts);
    return { pts, mat, rows: 0 };
  })();
  // sample the photo into points: one per cell where the image is not transparent; alpha goes in position.z
  function photoPoints(img) {
    const GW = 176, GH = 110, c = document.createElement('canvas'); c.width = GW; c.height = GH;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, GW, GH);
    const d = g.getImageData(0, 0, GW, GH).data, pos = [], col = [], seed = [], start = new Float32Array(GW * GH);
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), r = (a, b) => rand(a * 57 + b * 131, 207);
      return (r(xi, yi) * (1 - sx) + r(xi + 1, yi) * sx) * (1 - sy) + (r(xi, yi + 1) * (1 - sx) + r(xi + 1, yi + 1) * sx) * sy; };
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) start[y * GW + x] = Math.min(1, Math.max(0, 0.7 * vn(x / 13, y / 13) + 0.3 * rand(y * GW + x, 208)));
    // points close to the page colour carry no picture (the soft glow, the faint floor): they fade, so the particles
    // are the molecule, the set and the steam
    const bg = document.documentElement.dataset.theme === 'dark' ? [16, 19, 24] : [243, 245, 249];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const k = (y * GW + x) * 4, diff = Math.max(Math.abs(d[k] - bg[0]), Math.abs(d[k + 1] - bg[1]), Math.abs(d[k + 2] - bg[2])) / 255;
      const a = d[k + 3] / 255 * Math.min(1, Math.max(0, (diff - 0.12) / 0.25));
      if (a < 0.06) continue;
      // canvas pixels are premultiplied-free sRGB: back to linear light for the scene
      pos.push((x + 0.5) / GW - 0.5, 0.5 - (y + 0.5) / GH, a);
      col.push((d[k] / 255) ** 2.2, (d[k + 1] / 255) ** 2.2, (d[k + 2] / 255) ** 2.2);
      const i = y * GW + x; seed.push(rand(i, 201), rand(i, 202), rand(i, 203), start[i]);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    dis.pts.geometry.dispose(); dis.pts.geometry = geo; dis.rows = GH;
    return { GW, GH, start };
  }
  camera.position.set(0, 0.6, 15.5);
  const lowDpr = (window.devicePixelRatio || 1) < 1.5;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: software ? 0 : coarse ? 2 : 4 }));   // MSAA on every screen; one off-screen pass keeps it cheap
  composer.addPass(new RenderPass(scene, camera));
  const blurX = new ShaderPass(DefocusShader), blurY = new ShaderPass(DefocusShader);
  blurY.uniforms.uDir.value.set(0, 1);
  blurX.enabled = blurY.enabled = false;
  composer.addPass(blurX); composer.addPass(blurY);
  let defocus = 0;
  const lens = new ShaderPass(LensShader);
  // the lens always draws to the screen, so nothing reads a buffer after it: with no swap the sharp pipeline keeps to one
  // render target (and one set of MSAA buffers) instead of alternating between two
  lens.needsSwap = false;
  composer.addPass(lens);
  // out of focus, MSAA adds nothing and the blur passes would write multisampled buffers: blurred frames go through
  // pipelines without it, at full resolution for a slight blur and at half resolution once the blur spans many pixels,
  // where the picture is the same at about a third of the GPU time. They share the passes and own their buffers
  const plain = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 0 });
  const composerSoft = new EffectComposer(renderer, plain()), composerLo = new EffectComposer(renderer, plain());
  composer.passes.forEach(p => { composerSoft.addPass(p); composerLo.addPass(p); });
  let lowRes = false;
  // on slow GPUs the drawing resolution steps down (1.5, 1.25, 1 device pixels per CSS pixel) when frames keep running
  // long; capable GPUs never step. GPU time comes from timer queries where the browser offers them (Chrome on desktop)
  const gl = renderer.getContext(), tq = software ? null : gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const PR_STEPS = [1.5, 1.25, 1], gpuSamples = [], tqPending = [];
  let prCap = coarse ? 1.25 : 1.5, gpuCb = null, governFrom = Infinity;

  const geo = new THREE.SphereGeometry(1, coarse ? 10 : 14, coarse ? 7 : 10), FADE = new Float32Array(N).fill(1), aFade = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(1), 1);
  aFade.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aFade', aFade);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.3, metalness: 0.15, alphaToCoverage: true });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, clayU);
    sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float aFade;\nvarying float vFade;\nvoid main() {\n\tvFade = aFade;');
    // the sketch is drawn flat, like pencil on paper: the ink colour with no light, broken by the paper's tooth (a fine
    // grain plus a softer variation in pressure, in screen space so it stays put) where the page colour shows through
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying float vFade;
uniform float uSketch;
uniform vec3 uPaper;
float grain = 1.0;
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(12.9898, 78.233))) * 43758.5453), b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(12.9898, 78.233))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453), d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(12.9898, 78.233))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y); }
void main() {`).replace('#include <color_fragment>', `#include <color_fragment>
\tdiffuseColor.a *= vFade;
\tif (uSketch > 0.0) {
\t\tvec2 fc = gl_FragCoord.xy;
\t\tfloat tooth = vn(fc * 0.55) * 0.6 + vn(vec2(fc.x * 0.9 + fc.y * 0.5, fc.y * 0.25) * 0.7) * 0.4, press = vn(fc * 0.02);
\t\tgrain = clamp(0.2 + 1.2 * tooth * (0.7 + 0.5 * press), 0.0, 1.0);
\t}`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, mix(uPaper, diffuseColor.rgb, grain), uSketch);');
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform sampler2D uMatcap;\nuniform float uClay;\nvoid main() {')
      .replace('#include <opaque_fragment>', '#include <opaque_fragment>\n\tgl_FragColor.rgb = mix(gl_FragColor.rgb, diffuseColor.rgb * texture2D(uMatcap, normal.xy * 0.495 + 0.5).rgb * 1.25, uClay);');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));   // per-instance colours from the start; the loop writes the buffers directly
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;   // instances move far from the cached bounds, so never cull the cloud
  const holder = new THREE.Group(); holder.add(mesh); scene.add(holder);
  // a small photo studio for the render step: a backdrop sweep (floor curving up into a wall), a soft contact
  // shadow and two softboxes on stands; it fades in with the light
  const studio = new THREE.Group(), studioFade = [];
  studio.visible = false;
  // the studio was laid out around a molecule at the old size; scale it with the shared angstrom scale
  studio.scale.setScalar(CAF_SC / 0.95);
  studio.position.y = STUDIO_Y;   // the set sits below the molecule: the cup underneath, its steam rising into it
  holder.add(studio);
  {
    const yF = -2.75, zF = 7.5, zB = -3.4, R = 1.7, prof = [[zF, yF]];
    for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI / 2; prof.push([zB + R - Math.sin(a) * R, yF + R - Math.cos(a) * R]); }
    prof.push([zB, 5.0]);
    const pos = [], idx = [], uv = [];
    prof.forEach(([z, y], k) => { const v = k / (prof.length - 1); pos.push(-14, y, z, 14, y, z); uv.push(0, v, 1, v); });
    for (let k = 0; k < prof.length - 1; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    // the sweep fades out toward its sides and top, so it melts into the page instead of ending in hard edges
    const fc = document.createElement('canvas');
    fc.width = 256; fc.height = 128;
    const fg = fc.getContext('2d'), fd = fg.createImageData(256, 128);
    for (let x = 0; x < 256; x++) for (let y = 0; y < 128; y++) {
      const u = x / 255 - 0.5, v = y / 127, a = Math.exp(-((u / 0.16) ** 2)) * Math.max(0, 1 - Math.max(0, (1 - v) - 0.4) / 0.6) * Math.min(1, (1 - v) / 0.42);   // canvas rows run top-down, so (1 - v) is the texture v: 0 at the front edge
      const k = (y * 256 + x) * 4; fd.data[k] = fd.data[k + 1] = fd.data[k + 2] = Math.round(255 * a); fd.data[k + 3] = 255;
    }
    fg.putImageData(fd, 0, 0);
    const fade = new THREE.CanvasTexture(fc);
    g.computeVertexNormals();
    // the floor of the viewport preview: flat, unlit, with a faint grid as in Blender
    const backMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, alphaMap: fade });
    studio.add(Object.assign(new THREE.Mesh(g, backMat), { name: 'backdrop' }));
    studioFade.push([backMat, 0.95, 'back']);
    backMat.visible = false;   // the preview shows only the floor grid; the backdrop is kept for the shot export
    {
      // the grid fades out toward its edges and leaves out the saucer's footprint (its well dips just below the floor)
      const gp = [], gc = [], fadeA = (x, z) => Math.hypot(x - CUP.x, z - CUP.z) < 0.9 * CUP.s ? 0 : Math.max(0, 1 - Math.hypot(x / 6, (z - 2) / 4.5));
      for (let x = -6; x <= 6; x += 0.5) for (let z = -1.5; z < 6; z += 0.25) { gp.push(x, yF + 0.012, z, x, yF + 0.012, z + 0.25); const a0 = fadeA(x, z), a1 = fadeA(x, z + 0.25); gc.push(1, 1, 1, a0, 1, 1, 1, a1); }
      for (let z = -1.5; z <= 6; z += 0.5) for (let x = -6; x < 6; x += 0.25) { gp.push(x, yF + 0.012, z, x + 0.25, yF + 0.012, z); const a0 = fadeA(x, z), a1 = fadeA(x + 0.25, z); gc.push(1, 1, 1, a0, 1, 1, 1, a1); }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
      gg.setAttribute('color', new THREE.Float32BufferAttribute(gc, 4));
      const gridMat = new THREE.LineBasicMaterial({ color: 0x8a9099, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      // drawn after the clay set, so the set hides the grid lines under it
      studio.add(Object.assign(new THREE.LineSegments(gg, gridMat), { name: 'grid', renderOrder: 2 }));
      studioFade.push([gridMat, 0.35, 'back']);
    }
    const sc = document.createElement('canvas');
    sc.width = sc.height = 128;
    const sg = sc.getContext('2d'), grd = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grd; sg.fillRect(0, 0, 128, 128);
    const shMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.6), shMat);
    sh.rotation.x = -Math.PI / 2; sh.position.y = yF + 0.02;
    studio.add(sh);
    studioFade.push([shMat, 0.5]);
    shMat.visible = false;   // the viewport preview is raw: no painted shadows
    // a cup of coffee on the floor beside the molecule, steaming: cup and saucer turned on a lathe, a dark coffee
    // surface, and three soft wisps of steam drawn in a small shader
    {
      const cupMat = clayMat({ color: 0xd8d4cc, transparent: true, opacity: 0 });
      const coffeeMat = clayMat({ color: 0x2a160c, transparent: true, opacity: 0 });
      studioFade.push([cupMat, 1, 'cup'], [coffeeMat, 1, 'cup']);
      // clay first, like a viewport preview in Blender; the render pass swaps in an orange glaze and coffee
      const CLAY = new THREE.Color(0xa9adb5), PORC = new THREE.Color(0xd8692c), BREW = new THREE.Color(0x2a160c), CLAYD = new THREE.Color(0x8e939c);
      studio.userData.cupLook = r => { cupMat.color.copy(CLAY).lerp(PORC, r); coffeeMat.color.copy(CLAYD).lerp(BREW, r); cupMat.roughness = 0.75 - 0.47 * r; coffeeMat.roughness = 0.75 - 0.63 * r; cupMat.envMapIntensity = 0.25 + 0.65 * r; };
      studio.userData.cupLook(0);
      const cup = new THREE.Group(), V2 = THREE.Vector2;
      const wall = CUP_WALL.map(([r, h]) => new V2(r, h));
      cup.add(Object.assign(new THREE.Mesh(new THREE.LatheGeometry(wall, 40), cupMat), { name: 'cup' }));
      // a soft contact shadow under the saucer, so the cup sits on the floor
      {
        const c2 = document.createElement('canvas'); c2.width = c2.height = 128;
        const g2 = c2.getContext('2d'), gr = g2.createRadialGradient(64, 64, 6, 64, 64, 64);
        gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
        const shM = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
        const sh2 = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), shM);
        sh2.rotation.x = -Math.PI / 2; sh2.position.y = -0.035; cup.add(sh2);
        studioFade.push([shM, 0.85, 'cupshadow']);
        shM.visible = false;
      }
      const saucer = CUP_SAUCER.map(([r, h]) => new V2(r, h));
      const sc = new THREE.Mesh(new THREE.LatheGeometry(saucer, 40), cupMat); sc.position.y = -0.04; sc.name = 'saucer'; cup.add(sc);
      const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.478, 40), coffeeMat); coffee.name = 'coffee'; coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.6; cup.add(coffee);
      // steam: soft, blurry particles that leave the coffee surface, rise and swirl through a smooth flow field,
      // growing and fading as they age, then start again; positions are in the cup's own space
      const SN = coarse ? 90 : 140, sPos = new Float32Array(SN * 3), sAge = new Float32Array(SN), sLife = new Float32Array(SN), sSeed = new Float32Array(SN), sAlpha = new Float32Array(SN), sSize = new Float32Array(SN);
      const spawn = (i, age) => { const a = rand(i, 141) * 6.283, r = Math.sqrt(rand(i + age * 13, 142)) * 0.36; sPos[i * 3] = Math.cos(a) * r; sPos[i * 3 + 1] = 0.72; sPos[i * 3 + 2] = Math.sin(a) * r; sAge[i] = age; };
      for (let i = 0; i < SN; i++) { sLife[i] = 2.6 + rand(i, 143) * 1.6; sSeed[i] = rand(i, 144) * 10; spawn(i, rand(i, 145) * sLife[i]); }
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
      sGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sAlpha, 1).setUsage(THREE.DynamicDrawUsage));
      sGeo.setAttribute('aSize', new THREE.BufferAttribute(sSize, 1).setUsage(THREE.DynamicDrawUsage));
      const steamMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, toneMapped: false,
        uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0xffffff) }, uScale: { value: 400 } },
        vertexShader: `attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
          void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uOpacity; uniform vec3 uColor; varying float vA;
          void main() { float r = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.36, r) * vA * uOpacity; if (a < 0.003) discard; gl_FragColor = vec4(uColor * a, a); }`,
        blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
      });
      const steam = new THREE.Points(sGeo, steamMat);
      steam.renderOrder = 3;   // after the set: the cup hides the dots behind and inside it
      steam.frustumCulled = false;
      cup.add(steam);
      studio.userData.steamObj = steam;
      // condensation: the model's controller fills targets (holder space) and per-atom progress each frame
      const NA = 64, cond = { on: false, n: 0, c: new Float32Array(NA), g: new Float32Array(NA), tx: new Float32Array(NA), ty: new Float32Array(NA), tz: new Float32Array(NA) };
      studio.userData.condense = cond;
      const cv = new THREE.Vector3(), cl = new Float32Array(NA * 3), atomR = 0.45 * ANG / (STUDIO_K * CUP.s);
      // a fixed direction per particle on the unit sphere, for its place on the bubble shell
      const bubbleDir = i => { const a = rand(i, 151) * 6.283, z = rand(i, 152) * 2 - 1, r = Math.sqrt(1 - z * z); return [Math.cos(a) * r, z, Math.sin(a) * r]; };
      // the steam path is a fixed function of a particle's age, so the motion is identical on every visit and smooth at
      // any frame rate: it leaves the coffee, rises, slows, and swirls wider as it climbs
      const sA = new Float32Array(SN), sR = new Float32Array(SN), sOff = new Float32Array(SN), lockAge = new Float32Array(SN).fill(-1), sStart = new Float32Array(SN * 3);
      for (let i = 0; i < SN; i++) { sA[i] = rand(i, 141) * 6.283; sR[i] = Math.sqrt(rand(i, 142)) * 0.36; sOff[i] = rand(i, 145) * sLife[i]; }
      // the plume widens as it climbs, like a vase, until it envelops the whole molecule
      const plumeR = y => 0.3 + 1.55 * smooth(0.9, 3.2, y);
      const path = (i, age, out, k) => {
        const sd = sSeed[i], y = 0.72 + 1.4 * age - 0.08 * age * age, rr = sR[i] / 0.36, R = plumeR(y) * rr, a = sA[i] + age * 0.35;
        out[k] = Math.cos(a) * R + Math.sin(age * 1.6 + sd) * 0.06;
        out[k + 1] = y;
        out[k + 2] = Math.sin(a) * R * 0.75 + Math.cos(age * 1.3 + sd * 1.7) * 0.05;
      };
      const ease = x => x * x * x * (x * (x * 6 - 15) + 10);
      studio.userData.steamStep = () => {
        const t = performance.now() / 1000;
        if (cond.on && cond.n) {
          holder.updateMatrixWorld(); cup.updateMatrixWorld(true);
          for (let j = 0; j < cond.n; j++) { cv.set(cond.tx[j], cond.ty[j], cond.tz[j]).applyMatrix4(holder.matrixWorld); cup.worldToLocal(cv); cl[j * 3] = cv.x; cl[j * 3 + 1] = cv.y; cl[j * 3 + 2] = cv.z; }
        }
        // while the molecule forms, the rest of the steam thins to a light wisp
        const others = cond.on ? 1 - 0.7 * (cond.fade || 0) : 1;
        for (let i = 0; i < SN; i++) {
          const k = i * 3, L = sLife[i], age = (t + sOff[i]) % L, u = age / L;
          const c = cond.on && i < cond.n ? cond.c[i] : 0;
          if (c > 0.001) {
            // one bubble per atom: from where it was in the steam, it swells as it travels straight to its atom,
            // then fades as the atom sphere takes its place
            // a bubble leaves the coffee, grows to the atom's size on the way and fades as the sphere takes over
            // it leaves at speed and slows into place
            const cc = Math.min(1, c), e = cc * (2 - cc), g = cond.g[i], tx = cl[i * 3], ty = cl[i * 3 + 1], tz = cl[i * 3 + 2];
            // it rides the plume: rises from the coffee, spreading outward with the flare and spiralling gently
            // into its atom's direction, so it arrives from inside the steam
            const sy = 0.74, y = sy + (ty - sy) * e, rd = Math.hypot(tx, tz / 0.75), ab = Math.atan2(tz / 0.75, tx), spread = Math.pow(e, 1.4);
            const a = ab - (1 - e) * 0.9, R = rd * spread;
            sPos[k] = Math.cos(a) * R; sPos[k + 1] = y; sPos[k + 2] = Math.sin(a) * R * 0.75;
            sSize[i] = 0.1 + (atomR * 2.6 - 0.1) * Math.sqrt(e);
            sAlpha[i] = smooth(0, 0.08, c) * 0.62 * (1 - smooth(0.2, 1, g));
            continue;
          }
          lockAge[i] = -1;
          path(i, age, sPos, k);
          // every puff fades in at the coffee and fades out softly as it rises out of the scene
          sAlpha[i] = smooth(0, 0.06, u) * (1 - smooth(0.45, 0.95, u)) * 0.3 * others;
          sSize[i] = 0.05 + u * 0.13;   // small crisp dots, like viewport particles
        }
        sGeo.attributes.position.needsUpdate = true; sGeo.attributes.aAlpha.needsUpdate = true; sGeo.attributes.aSize.needsUpdate = true;
        steamMat.uniforms.uScale.value = H * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(15))) * STUDIO_K * CUP.s;
      };
      // a few lab things on the floor beside the cup: a conical flask, two test tubes in a small rack and a pencil.
      // In the browser they stay clay; the Blender render of the finished shot makes the flask and tubes glass
      {
        const V2 = THREE.Vector2, props = new THREE.Group(), mats = [];
        const mk = (clay, final, rough, fx, extra = {}) => { const m = clayMat({ color: clay, transparent: true, opacity: 0, ...extra }); mats.push([m, new THREE.Color(clay), new THREE.Color(final), rough, fx]); studioFade.push([m, 1, 'cup']); return m; };
        const C1 = 0xa9adb5, C2 = 0x8e939c, nm = (o, name) => { o.name = name; return o; };
        const glass = mk(C1, C1, 0.8, 0), liquid = mk(C2, C2, 0.8, 0), wood = mk(C1, C1, 0.8, 0), paint = mk(C1, C1, 0.8, 0), lead = mk(C2, C2, 0.8, 0);
        // conical flask: a lathe profile with a neck and a lip, the liquid as a solid inside it
        const fp = [[0, 0], [0.44, 0], [0.48, 0.05], [0.46, 0.14], [0.22, 0.66], [0.13, 0.76], [0.13, 1.0], [0.155, 1.02], [0.155, 1.05], [0.12, 1.05]].map(([r, h]) => new V2(r, h));
        const fGroup = new THREE.Group();
        fGroup.add(nm(new THREE.Mesh(new THREE.LatheGeometry(fp, 32), glass), 'flask'));
        fGroup.add(nm(new THREE.Mesh(new THREE.LatheGeometry([[0, 0.03], [0.42, 0.03], [0.45, 0.08], [0.43, 0.15], [0.35, 0.33], [0, 0.33]].map(([r, h]) => new V2(r, h)), 32), liquid), 'flask_liquid'));
        fGroup.scale.setScalar(1.45); fGroup.position.set(-2.25, yF, 0.4); props.add(fGroup);
        // test tubes in a little rack
        const rack = new THREE.Group();
        const bar = nm(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.26), wood), 'rack'); bar.position.y = 0.5; rack.add(bar);
        const base = nm(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.26), wood), 'rack'); base.position.y = 0.03; rack.add(base);
        [-0.42, 0.42].forEach(x => { const leg = nm(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.2), wood), 'rack'); leg.position.set(x, 0.27, 0); rack.add(leg); });
        [-0.2, 0.2].forEach((x, k) => {
          const tube = nm(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 20, 1, true), glass), 'tube'); tube.position.set(x, 0.6, 0); rack.add(tube);
          const end = nm(new THREE.Mesh(new THREE.SphereGeometry(0.08, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glass), 'tube'); end.position.set(x, 0.15, 0); rack.add(end);
          const fill = nm(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.3 + 0.15 * k, 20), liquid), k ? 'tube_liquid_b' : 'tube_liquid_a'); fill.position.set(x, 0.3 + 0.075 * k, 0); rack.add(fill);
        });
        rack.position.set(2.35, yF, -0.2); rack.rotation.y = -0.4; props.add(rack);
        // a pencil lying on the floor
        const pencil = new THREE.Group();
        pencil.add(nm(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.3, 6), paint), 'pencil'));
        const tip = nm(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), wood), 'pencil_wood'); tip.position.y = 0.73; pencil.add(tip);
        const nib = nm(new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 6), lead), 'pencil_lead'); nib.position.y = 0.82; pencil.add(nib);
        pencil.rotation.set(0, 0.5, Math.PI / 2); pencil.position.set(-1.45, yF + 0.045, 1.8); props.add(pencil);
        studio.add(props);
        studio.userData.props = props;
        const prevLook = studio.userData.cupLook;
        studio.userData.cupLook = (r, sweep) => { prevLook(r); mats.forEach(([m, c0, c1, rf, fx]) => { const q = sweep ? sweep(fx) : r; m.color.copy(c0).lerp(c1, q); m.roughness = 0.8 + (rf - 0.8) * q; }); };
      }
      cup.scale.setScalar(CUP.s);
      cup.position.set(CUP.x, yF, CUP.z);
      cup.rotation.y = -0.5;
      studio.add(cup);
      studio.userData.steam = steamMat;
    }
    // the cover backdrop for the finished render: a deep warm gradient with soft bokeh, fading into the page at
    // its edges, the way a journal cover image is set; one texture per theme
    {
      const makeCover = dark => {
        const c = document.createElement('canvas'); c.width = 1024; c.height = 768;
        const g = c.getContext('2d');
        const bg = g.createRadialGradient(560, 330, 20, 512, 384, 560);
        if (dark) { bg.addColorStop(0, '#5e4a3a'); bg.addColorStop(0.4, '#352b24'); bg.addColorStop(0.75, '#1e1a18'); bg.addColorStop(1, '#141619'); }
        else { bg.addColorStop(0, '#fff6e8'); bg.addColorStop(0.4, '#f1e3cf'); bg.addColorStop(0.75, '#e6e0d8'); bg.addColorStop(1, '#eceff4'); }
        g.fillStyle = bg; g.fillRect(0, 0, 1024, 768);
        for (let k = 0; k < 34; k++) {
          const x = rand(k, 161) * 1024, y = rand(k, 162) * 768, r = 10 + rand(k, 163) * 46, a = (dark ? 0.1 : 0.16) * (0.4 + rand(k, 164));
          const b = g.createRadialGradient(x, y, r * 0.2, x, y, r);
          const col = dark ? '255,196,140' : '214,160,110';
          b.addColorStop(0, `rgba(${col},${a})`); b.addColorStop(0.85, `rgba(${col},${a * 0.7})`); b.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = b; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
        // edge falloff into the page
        g.globalCompositeOperation = 'destination-in';
        g.save(); g.translate(512, 384); g.scale(1.33, 1);
        const m = g.createRadialGradient(0, 0, 150, 0, 0, 380);
        m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = m; g.fillRect(-400, -400, 800, 800); g.restore();
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
      };
      // the cover is held at zero opacity for now (coverR in the timeline), so each is painted and uploaded only when
      // something asks for it: the shot export, or a cover that is shown
      const covers = {}, coverOf = dark => covers[dark ? 'dark' : 'light'] ||= makeCover(dark);
      // a soft ramp as alpha map, slid across so the backdrop is wiped in from left to right with the render
      const rc = document.createElement('canvas'); rc.width = 256; rc.height = 1;
      const rg = rc.getContext('2d'), ramp = rg.createLinearGradient(0, 0, 256, 0);
      ramp.addColorStop(0, '#fff'); ramp.addColorStop(0.44, '#fff'); ramp.addColorStop(0.56, '#000'); ramp.addColorStop(1, '#000');
      rg.fillStyle = ramp; rg.fillRect(0, 0, 256, 1);
      const wipe = new THREE.CanvasTexture(rc);
      const coverMat = new THREE.MeshBasicMaterial({ alphaMap: wipe, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      studioFade.push([coverMat, 1, 'cover']);
      const cover = new THREE.Mesh(new THREE.PlaneGeometry(15, 11.25), coverMat);
      cover.position.set(0.2, 2.6, zB + 0.06);
      studio.add(cover);
      coverMat.visible = false;
      studio.userData.cover = { mat: coverMat, covers, coverOf, wipe };
    }
    // two softboxes on stands, aimed at the subject: a rounded diffuser that glows brightest in the middle and
    // falls off toward its edge, a thin dark frame, and a smooth pole; edges stay soft so nothing stair-steps
    const gc = document.createElement('canvas');
    gc.width = 128; gc.height = 192;
    const gg = gc.getContext('2d');
    const rr = (x, y, w, h, r) => { gg.beginPath(); gg.moveTo(x + r, y); gg.arcTo(x + w, y, x + w, y + h, r); gg.arcTo(x + w, y + h, x, y + h, r); gg.arcTo(x, y + h, x, y, r); gg.arcTo(x, y, x + w, y, r); gg.closePath(); };
    gg.filter = 'blur(1.5px)';
    gg.fillStyle = 'rgba(40,44,54,1)'; rr(3, 3, 122, 186, 16); gg.fill();
    const gl = gg.createRadialGradient(64, 96, 6, 64, 96, 92);
    gl.addColorStop(0, 'rgba(255,255,255,1)'); gl.addColorStop(0.6, 'rgba(244,246,250,1)'); gl.addColorStop(1, 'rgba(205,210,220,1)');
    gg.fillStyle = gl; rr(10, 10, 108, 172, 11); gg.fill();
    const glowTex = new THREE.CanvasTexture(gc);
    glowTex.colorSpace = THREE.SRGBColorSpace; glowTex.anisotropy = 4; glowTex.generateMipmaps = true; glowTex.minFilter = THREE.LinearMipmapLinearFilter;
    const boxMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
    const standMat = clayMat({ color: 0x5d6575, transparent: true, opacity: 0 });
    studio.userData.rigs = [];
    [[-4.6, 3.3, 0.9], [4.8, 3.7, -1.0]].forEach(([x, y, z], k) => {
      const rig = new THREE.Group(); studio.add(rig); studio.userData.rigs.push(rig);
      const bm = boxMat.clone(), sm = standMat.clone();
      studioFade.push([bm, 0.95, 'light' + k], [sm, 1, 'light' + k]);
      const beamMat = new THREE.LineDashedMaterial({ color: 0xffb547, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      studioFade.push([beamMat, 0.8, 'beam' + k]);
      const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y, z), new THREE.Vector3(0, 2.6, 0)]), beamMat);
      beam.computeLineDistances(); rig.add(beam);
      const box = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.65), bm);
      box.position.set(x, y, z); box.lookAt(0, 2.5, 0);
      rig.add(box);
      const h = y - 0.8 - yF, stand = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h, 20), sm);
      stand.position.set(x, yF + h / 2, z);
      rig.add(stand);
      // a short yoke from the pole to the back of the box
      const yoke = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 16), sm);
      yoke.position.set(x, y - 0.65, z); rig.add(yoke);
    });
  }
  // the set the Blender render was made from, as clay: set-clay.js (the glTF binary exported from the same Blender scene) in this
  // group's own frame, so the clay frame and the photo line up. It loads in the background; until then the simple
  // props above stand in
  {
    const setClay = clayMat({ color: 0xd2d5da, transparent: true, opacity: 0 });
    studioFade.push([setClay, 1, 'cup']);
    // the model comes as a module (some hosts allow scripts and images but not fetch), decoded and parsed in place
    Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('./set-clay.js')])
      .then(([{ GLTFLoader }, { default: b64 }]) => new Promise((ok, fail) => {
        const bin = atob(b64), buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        new GLTFLoader().parse(buf.buffer, '', ok, fail);
      }))
      .then(g => {
        g.scene.traverse(o => { if (o.isMesh) o.material = setClay; });
        g.scene.name = 'set-clay';
        studio.add(g.scene);
        if (studio.userData.props) studio.userData.props.visible = false;
        anim = true;
      })
      .catch(() => {});
  }
  const CLAY_BACK_D = new THREE.Color(0x5a5e66), CLAY_BACK_L = new THREE.Color(0x9a9ea6);
  // stage: backdrop, shadow and cup; l0, l1: the key and the fill softbox; beams: their direction lines
  function setStudio(r, l0 = r, l1 = r, beams = 0, cupR = r, coverR = 0) {
    studio.visible = r > 0.01;
    if (!studio.visible) return;
    // the sweep is tinted toward the page background, so lit it reads as a studio but its edges sink into the page
    const cs = getComputedStyle(document.documentElement), dark = document.documentElement.dataset.theme === 'dark';
    const tint = new THREE.Color(cs.getPropertyValue('--bg').trim() || '#F3F5F9').multiplyScalar(dark ? 2.2 : 0.4);
    // in clay mode the backdrop is clay too; it takes the page tint during the render pass
    tint.lerpColors(dark ? CLAY_BACK_D : CLAY_BACK_L, tint, studio.userData.backR || 0);
    const lvl = { light0: l0, light1: l1, beam0: l0 * beams, beam1: l1 * beams, cup: cupR, cupshadow: cupR, cover: coverR };
    studioFade.forEach(([m, max, kind]) => {
      m.opacity = max * (kind in lvl ? lvl[kind] : r);
      if (kind === 'back') m.color.copy(tint);
      // the cup is drawn opaque once it has fully appeared, which skips blending and depth sorting
      // the clay set always writes depth, so the grid and the steam drawn after it never show through it
      if (kind === 'cup') m.depthWrite = m.opacity > 0.02;
    });
    // at zero opacity the cover adds nothing to the frame, so it is not drawn at all
    if (studio.userData.cover) { const cv2 = studio.userData.cover; cv2.mat.visible = lvl.cover > 0; if (cv2.mat.visible) { const want = cv2.coverOf(dark); if (cv2.mat.map !== want) { cv2.mat.map = want; cv2.mat.needsUpdate = true; } } }
    if (studio.userData.steam) { studio.userData.steam.uniforms.uOpacity.value = cupR * (dark ? 1 : 1.9); studio.userData.steam.uniforms.uColor.value.set(dark ? '#ffffff' : '#5d6575'); if (cupR > 0.01 && !reduce && !(studio.userData.condense && studio.userData.condense.frozen)) { studio.userData.steamStep(); anim = true; } }
  }
  // bonds as real cylinders between particles, drawn for whichever formations are on screen
  const BMAX = coarse ? 420 : 700;
  const stickGeo = new THREE.CylinderGeometry(1, 1, 1, coarse ? 6 : 10, 1, true), bFade = new THREE.InstancedBufferAttribute(new Float32Array(BMAX).fill(1), 1);
  bFade.setUsage(THREE.DynamicDrawUsage); stickGeo.setAttribute('aFade', bFade);
  const bondMesh = new THREE.InstancedMesh(stickGeo, mesh.material, BMAX);
  bondMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bondMesh.frustumCulled = false;
  bondMesh.count = 0;
  bondMesh.setColorAt(0, new THREE.Color(1, 1, 1));   // per-instance colours from the start, so its shader never changes
  holder.add(bondMesh);

  const forms = {};
  function addFormation(name, P) {
    if (typeof P === 'function') P = P();
    forms0[name] = P;
    const pos = new Float32Array(N * 3), size = new Float32Array(N), col = new Uint8Array(N);
    let cx = 0, cy = 0, cz = 0, n = 0;
    // a formation drawn only in lines (all its particles hidden) is framed by all of its points
    const linesOnly = P.filter(p => p.s > 0).length < 3, counts = p => linesOnly || p.s > 0;
    for (let i = 0; i < N; i++) {
      const p = i < P.length ? P[i] : P[Math.floor(rand(i, 7) * P.length)];
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      size[i] = i < P.length ? p.s : 0;
      col[i] = p.c;
      if (i < P.length && counts(p)) { cx += p.x; cy += p.y; cz += p.z; n++; }
    }
    cx /= n || 1; cy /= n || 1; cz /= n || 1;
    let ex = 0, ey = 0, ez = 0;
    for (let i = 0; i < Math.min(N, P.length); i++) if (counts(P[i])) {
      ex = Math.max(ex, Math.abs(pos[i * 3] - cx) + size[i]); ey = Math.max(ey, Math.abs(pos[i * 3 + 1] - cy) + size[i]); ez = Math.max(ez, Math.abs(pos[i * 3 + 2] - cz));
    }
    // a formation drawn inside a simulation cell is framed by the cell box
    if (P.meta && P.meta.cell) {
      const { min, max } = P.meta.cell, e = P.meta.euler, v = new THREE.Vector3(), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let k = 0; k < 8; k++) {
        v.set(k & 1 ? max[0] : min[0], k & 2 ? max[1] : min[1], k & 4 ? max[2] : min[2]).applyEuler(e);
        [v.x, v.y, v.z].forEach((c, a) => { lo[a] = Math.min(lo[a], c); hi[a] = Math.max(hi[a], c); });
      }
      cx = (lo[0] + hi[0]) / 2; cy = (lo[1] + hi[1]) / 2; cz = (lo[2] + hi[2]) / 2;
      ex = (hi[0] - lo[0]) / 2; ey = (hi[1] - lo[1]) / 2; ez = (hi[2] - lo[2]) / 2;
    }
    // nearer points look bigger, so pad by depth; the holder also sways a little
    const ext = P.meta && P.meta.frame ? { ...P.meta.frame } : { x: Math.max(1, ex * 1.06 + ez * 0.18), y: Math.max(0.6, ey * 1.04 + ez * 0.12) };
    forms[name] = { pos, size, col, rgb: null, meta: P.meta || { labels: [], euler: new THREE.Euler() }, center: new THREE.Vector3(cx, cy, cz), ext };
  }
  Object.entries(SHAPES).forEach(([k, fn]) => addFormation(k, fn));
  // the demo slab gains molecules above it, so frame it with some headroom
  // the network's incoming molecules and its output surface sit outside the nodes, so widen its frame
  
  // the atom field runs past the edges of the view, so it has no visible boundary
  forms.dust.ext = { x: 7.4, y: 3.5 };
  // the caffeine shot is framed with room for the studio set (cup to the lower right), so the molecule sits up and left
  // the sketch already spans the cup and the molecule; the model uses the same frame, widened a little for the lights
  forms.illSketch.ext.x *= 1.35; forms.illSketch.ext.y *= 1.08;
  // the demo's cell is framed a little tighter, so the surface and the molecule read larger
  forms.demo.ext = { x: forms.demo.ext.x * 0.84, y: forms.demo.ext.y * 0.84 };
  forms.illModel.center.copy(forms.illSketch.center); forms.illModel.ext = { ...forms.illSketch.ext };
  const MOL_FORMS = Object.values(forms).filter(F => F.meta.mol);
  // the three illustration panels may fill more of the frame
  forms.illForms.ext.x *= 0.86; forms.illForms.ext.y *= 0.86;
  const v3 = new THREE.Vector3();
  function setLocal(F, i, x, y, z, s, c) {
    v3.set(x, y, z).applyEuler(F.meta.euler);
    F.pos[i * 3] = v3.x; F.pos[i * 3 + 1] = v3.y; F.pos[i * 3 + 2] = v3.z;
    if (s !== undefined) F.size[i] = s;
    if (c !== undefined) F.col[i] = c;
  }
  let infoCb = () => {};
  const info = (name, text) => infoCb(name, text);

  // ---- live demos ----
  // a pulse that sweeps left to right across x in [0, 1]
  const sweep = (x, clock, period, width = 0.07) => { const f = (clock / period) % 1 * 1.4 - 0.2; return Math.exp(-((x - f) ** 2) / (width * width)); };
  const CTRL = {
    // once the blocks have formed, tokens are revealed one by one like a model writing; then the MLIP runs now and then
    aiNet: (() => {
      const F = forms.aiNet, { nodes, tokens } = F.meta, base = tokens.map(t => t.beads.map(i => F.size[i]));
      let t0 = null;
      return {
        update(dt, w, clock) {
          if (w(F) < 0.6) { t0 = null; F.meta.pulse = -1; F.meta.revealed = 0; tokens.forEach((t, k) => t.beads.forEach((i, b) => { F.size[i] = base[k][b]; })); return; }
          if (t0 === null) t0 = clock;
          const T = reduce ? 99 : clock - t0;
          const revealed = Math.max(0, Math.min(tokens.length, Math.floor((T - 1.2) / 0.16)));
          F.meta.revealed = revealed;
          // a revealed token's beads step back so the text reads cleanly on its tinted chip
          tokens.forEach((t, k) => t.beads.forEach((i, b) => { F.size[i] = k < revealed ? base[k][b] * 0.35 : base[k][b]; }));
          const run = T > 2 ? ((T - 2) % 6) / 2.4 : -1, on = run >= 0 && run <= 1 ? run : -1;
          F.meta.pulse = on;
          nodes.forEach((ids, l) => ids.forEach(i => {
            const b = on < 0 ? 0 : Math.exp(-((l / (nodes.length - 1) - (on * 1.4 - 0.2)) ** 2) / 0.03);
            F.size[i] = (l === nodes.length - 1 ? 0.15 : 0.1) * (1 + 0.45 * b);
            F.col[i] = l === nodes.length - 1 || b > 0.45 ? SLOT.A : SLOT.G;
          }));
        }
      };
    })(),
    // the surface converges from left to right as data arrives, then a faint shimmer keeps passing over it
    aiPes: (() => {
      const F = forms.aiPes, { grid, cols, xn, size } = F.meta;
      const noise = grid.map((_, k) => (rand(k, 71) - 0.5) * 2.2);
      let front = 0;
      return {
        update(dt, w, clock) {
          const wt = w(F);
          if (wt < 0.02) { front = 0; return; }
          if (wt > 0.5) front = reduce ? 1.2 : Math.min(1.2, front + dt / 3.4);
          grid.forEach((g, k) => {
            const on = smooth(-0.02, 0.02, front - xn[k]);
            const fresh = Math.exp(-((xn[k] - front) ** 2) / 0.004), glint = 0;
            setLocal(F, k, g.x, g.y + noise[k] * (1 - on), g.z, size * (0.75 + 0.25 * on) * (1 + 1.6 * fresh + glint), on > 0.5 ? (fresh > 0.4 ? SLOT.A : cols[k]) : SLOT.G);
          });
        }
      };
    })(),
    illModel: (() => {
      const F = forms.illModel, { local, base } = F.meta, v = new THREE.Vector3(), e = new THREE.Euler();
      const minY = Math.min(...local.map(p => p.y)), maxY = Math.max(...local.map(p => p.y));
      // launch order: bottom atoms first, evenly spaced, so the bubbles rise like beads on a string
      const order = local.map((p, i) => i).sort((a, b) => local[a].y - local[b].y), rank = new Array(local.length);
      order.forEach((i, r) => { rank[i] = r; });
      let t0 = null, uxs = null;
      return {
        update(dt, w, clock) {
          F.meta.wNow = w(F);
          if (w(F) < 0.5) { F.meta.orbit = 0; F.meta.frozen = false; F.meta.still = false; if (studio.userData.condense) { studio.userData.condense.on = false; studio.userData.condense.frozen = false; } if (t0 !== null) info('ill-guides', 0); F.meta.guides = 0; F.meta.bondFade = 1; if (studio.userData.rigs) studio.userData.rigs.forEach(g => { g.rotation.y = 0; }); key.position.set(5, 10, 8); t0 = null; key.intensity = 2.0; rim.intensity = 0.6; setStudio(0); lens.uniforms.uGrain.value = 0; lens.uniforms.uGrade.value = 0; mat.roughness = 0.3; mat.envMapIntensity = 1; if (studio.userData.cupLook) studio.userData.cupLook(0); studio.userData.backR = 0; return; }
          if (t0 === null) t0 = clock;
          // the timeline runs on its own clock, and scrolling through the illustration's stretch pushes it forward, so
          // a reader who keeps scrolling still sees the clay form, the shutter and the render
          const tNow = reduce ? 99 : Math.max(clock - t0, scrubT * (6.2 + 2.6));
          if (tNow < 8.8) anim = true;
          // the shot: the scene plays until the shutter fires at SHOT, then everything holds that exact frame
          const SHOT = 6.2, R0 = 5.0, T = tNow, Ts = Math.min(T, SHOT), wf = Math.min(1, (w(F) - 0.5) * 2), cond = studio.userData.condense;
          const frozen = T >= SHOT;
          if (frozen && !F.meta.frozen) info('ill-shot', 1);
          F.meta.frozen = frozen; F.meta.still = frozen; cond.frozen = frozen; F.meta.T = T;
          // 1 the cup appears and the steam rises; the viewport frames the shot
          const cupR = smooth(0.0, 0.9, Ts), stage = smooth(0.4, 1.4, Ts);
          // the camera orbits round the set looking for the angle, overshoots a little and settles
          const oq = Math.min(1, Ts / 2.2), oe = 1 - Math.pow(1 - oq, 3);
          F.meta.orbit = reduce ? 0 : (1 - oe) * 1.6 + Math.sin(oq * Math.PI) * 0.12;
          const guides = smooth(0.9, 1.8, T);   // the viewport stays up: it is part of the picture
          // 2 the steam condenses: bubbles gather at each atom's place and the atom swells out of them, bottom to top;
          //   at the shutter the top atoms are still forming, so the photo holds that moment
          const comp = smooth(0.2, 1.0, Ts);   // the molecule's angle is set before any bubble leaves
          e.set(0.32 * comp, -0.75 * comp, 0);
          // 4 (prepared here) the render sweeps across the frame from left to right: S runs 0 to 1, and a thing at
          //   fx (0 left, 1 right) takes its colours as the sweep passes it
          const S = smooth(R0, R0 + 1.2, Ts), reach = fx => Math.min(1, Math.max(0, (S - fx * 0.75) / 0.25));
          if (!uxs) { const ev = new THREE.Euler(0.32, -0.75, 0), xs = local.map(p => v.set(p.x, p.y, p.z).applyEuler(ev).x), lo = Math.min(...xs), hi = Math.max(...xs); uxs = xs.map(x => (x - lo) / (hi - lo)); }
          local.forEach((p, i) => {
            v.set(p.x, p.y, p.z).applyEuler(e);
            const late = rank[i] < LATE_N, gT = late ? LATE_GROW[rank[i]] : 1;
            // a late atom leaves so that at the shutter its growth (a smoothstep over 0.4 s) stands at gT
            const lateAt = late ? SHOT - 1.15 - 0.4 * (0.5 - Math.sin(Math.asin(1 - 2 * gT) / 3)) : 0;
            // the top atom leaves last and is still forming out of its bubbles when the shutter fires
            const u = (p.y - minY) / (maxY - minY), launch = late ? lateAt : 0.9 + (rank[i] - LATE_N) * (2.3 / (local.length - 1 - LATE_N)), ci = Math.min(1, Math.max(0, (Ts - launch) / 1.4)), gi = smooth(launch + 1.15, launch + 1.55, Ts);
            // the atom starts as a bubble the size of a steam particle and swells with a slight elastic overshoot
            const grow = gi <= 0 ? 0 : 0.7 + 0.3 * gi;   // the sphere takes over from a bubble of almost the same size
            const lit = false;   // the browser shows clay only; the finished render arrives as a photo after the shutter
            setLocal(F, i, v.x, v.y, v.z, rAt(base[i]) * grow, gi < 0.85 ? SLOT.L : lit ? (base[i] === 'H' ? SLOT.H : SLOT[base[i]]) : SLOT.CLAY);
            cond.c[i] = ci; cond.g[i] = gi; cond.tx[i] = F.pos[i * 3]; cond.ty[i] = F.pos[i * 3 + 1]; cond.tz[i] = F.pos[i * 3 + 2];
          });
          cond.n = local.length; cond.on = true; cond.fade = smooth(1.0, 2.8, Ts);
          // bonds form once the atoms are in place, bottom to top as they settle
          F.meta.bondFade = smooth(4.2, 6.0, Ts);
          // 3 lights while it forms: the key sweeps round to its angle, then the fill comes up; then gloss
          const l0 = smooth(2.0, 2.4, Ts), sweep = 1 - smooth(2.2, 3.4, Ts), l1 = smooth(3.2, 3.6, Ts), beams = 1 - smooth(3.8, 4.3, Ts);
          const rigs = studio.userData.rigs;
          if (rigs) { rigs[0].rotation.y = -1.1 * sweep; rigs[1].rotation.y = 0.5 * (1 - l1); }
          const ka = -1.1 * sweep, kx = 5 * Math.cos(ka) + 8 * Math.sin(ka), kz = -5 * Math.sin(ka) + 8 * Math.cos(ka);
          // the key sits high and to the left, so the clay's soft shadows fall on the floor and across the molecule
          key.position.set(kx * 0.5 - 2.5, 12, kz * 0.35);
          key.intensity = 1.0 + 1.6 * l0; rim.intensity = 0.2 + 0.8 * l1;
          // 4 render: everything starts in clay, backdrop included; colours and materials come in one after another
          //   (backdrop, molecule, cup, props) while the render's grain converges, the way a path tracer clears in Blender
          const rr = smooth(R0, R0 + 0.8, Ts), gloss = rr * wf;
          studio.userData.backR = 0;
          lens.uniforms.uGrain.value = 0;
          // clay: matte, almost no reflections; the gloss comes with the rendered photo
          mat.roughness = 0.3 + 0.55 * wf; mat.envMapIntensity = 1 - 0.85 * wf;
          // 4 after the shutter the frame develops: the cover backdrop, the props leave, the final grade
          const coverR = 0, props = 1 - 0.95 * smooth(SHOT + 0.4, SHOT + 1.4, T);
          // once the photo covers the frame the clay set is no longer needed; only the molecule's particles go on
          const keep = keepK;
          setStudio(stage * wf * keep, l0 * wf * props * keep, l1 * wf * props * keep, beams, cupR * wf * keep, coverR * wf);
          lens.uniforms.uGrade.value = 0;
          if (Math.abs((F.meta.guides ?? -1) - guides) > 0.01) { F.meta.guides = guides; info('ill-guides', guides); }
        }
      };
    })(),
    illForms: (() => {
      const F = forms.illForms, { frames } = F.meta;
      return {
        update(dt, w, clock) {
          if (w(F) < 0.3) return;
          const on = reduce ? 3 : Math.floor(clock / 0.55) % frames.length;
          frames.forEach((f, k) => {
            f.out.forEach(i => { F.col[i] = k === on ? SLOT.A : SLOT.G; });
            F.size[f.mol] = F.size[f.mol + 1] = k === on ? 0.068 : 0.05;
          });
        }
      };
    })(),
    viz: (() => {
      const F = forms.viz, base = F.col.slice();
      let w = 1, play = 0;
      function apply() { const thr = -3.8 + w * 7.6; for (let i = 0; i < N; i++) F.col[i] = F.pos[i * 3] < thr ? base[i] : SLOT.CLAY; }
      return {
        act(a, v) {
          if (a === 'wipe') { w = clamp(v); play = 0; apply(); }
          if (a === 'play') { if (reduce) { w = 1; apply(); return; } w = 0; play = 1; apply(); }
        },
        update(dt) { if (!play) return; w = Math.min(1, w + dt / 2.4); apply(); info('viz-wipe', w); if (w >= 1) play = 0; }
      };
    })(),
    // the batch: one cell per (surface, molecule) pair, up to four, all relaxing at once as an MLIP batches systems on
    // one GPU. layout builds the cells; run starts the molecules. A molecule comes in from above, off to one side and
    // tilted; then, by its kind on that surface: chemisorbed lands on the top atom in close contact with a damped bounce
    // and vibrates there; physisorbed settles about 3 A up and wanders; desorbing touches down, then drifts out of the
    // cell. Thermal noise comes from a fixed seed per run, so a system always plays the same way
    demo: (() => {
      // the molecules' atoms are drawn smaller than the page's usual radii, so their bonds read next to the big metal atoms
      const F = forms.demo, { slabs, atoms, beads } = F.meta, H0 = 7.5, STEP_S = 0.09, MOL_S = 0.68;
      let runs = [], pause = 0, cellsNow = [], laidOut = false, aspect = 1.6;
      function buildCell(k, surf, ox, oy, oz) {
        // a periodic cell of 5 x 5 atoms per layer; every atom is wrapped back into the cell, as in a periodic
        // simulation, so the slab fills its box exactly
        const S = SURFS[surf], a = S.a * ANG, d = S.d * ANG, ids = slabs[k], r = rAt('Cu') * Math.min(1.12, S.a / 2.55);
        // (111) takes four rows, since a hexagonal layer only repeats across the wall after an even number of rows
        const hex = S.lat === '111', dz = hex ? Math.sqrt(3) / 2 : 1, rows = hex ? 4 : 5, Lx = 5 * a, Lz = rows * a * dz;
        const sh = hex ? [[0, 0], [0.5, Math.sqrt(3) / 6], [1, Math.sqrt(3) / 3]] : [[0, 0], [0.5, 0.5], [0, 0]];
        const wrap = (v, L) => { v = ((v + L / 2) % L + L) % L - L / 2; return v; };
        let top = -1, n = 0, x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (let L = 0; L < 3; L++) for (let j = 0; j < rows; j++) for (let i = 0; i < 5; i++) {
          const idx = ids[n++];
          // (111): rows sit half a spacing apart, every second row shifted; layers stack A, B, C
          const x = wrap((i - 2 + (hex ? (j % 2) * 0.5 : 0) + sh[L][0]) * a, Lx), z = wrap((j - (rows - 1) / 2) * a * dz + sh[L][1] * a, Lz);
          setLocal(F, idx, ox + x, oy - L * d, oz + z, r, SLOT[S.c[L ? 1 : 0]]);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
          if (L === 0 && i === 2 && j === 2) top = idx;
        }
        while (n < ids.length) F.size[ids[n++]] = 0;
        // the box drawn around the cell encloses the atoms whole: a periodic cell's walls pass through the wrapped atoms,
        // which reads as the slab being cut off at its edges
        const m = r * 1.08;
        return { surf, top, topCol: SLOT[S.c[0]], off: [ox, oy, oz], min: [ox + x0 - m, oy - 2 * d - 0.9 * ANG, oz + z0 - m], max: [ox + x1 + m, oy + CELL_H, oz + z1 + m] };
      }
      // the cells sit on a grid as seen on screen: rows and columns in the view plane, every cell centred on its slot and
      // the whole grid centred on the origin, so orbiting turns it about its middle. The number of columns is the one
      // that shows the cells largest in the viewport's shape; a short last row is centred
      const CELL_H = 13 * ANG, CELL_W = 5 * 2.88 * ANG, view = new THREE.Vector3(), inv = new THREE.Quaternion();
      function grid(n) {
        const e = F.meta.euler, lo = [Infinity, Infinity], hi = [-Infinity, -Infinity], y0 = -2 * 2.35 * ANG - 0.9 * ANG;
        for (let k = 0; k < 8; k++) { view.set(k & 1 ? CELL_W / 2 : -CELL_W / 2, k & 2 ? CELL_H : y0, k & 4 ? CELL_W / 2 : -CELL_W / 2).applyEuler(e); lo[0] = Math.min(lo[0], view.x); hi[0] = Math.max(hi[0], view.x); lo[1] = Math.min(lo[1], view.y); hi[1] = Math.max(hi[1], view.y); }
        const cw = (hi[0] - lo[0]) * 1.1, ch = (hi[1] - lo[1]) * 1.06;
        // one row for up to three when the viewport is wide enough for it; four always as 2 x 2
        const cols = n === 4 ? 2 : n < 3 || Math.min(aspect / (3 * cw), 1 / ch) >= Math.min(aspect / (2 * cw), 1 / (2 * ch)) ? n : 2;
        const rows = Math.ceil(n / cols), mid = new THREE.Vector3(0, (y0 + CELL_H) / 2, 0);
        inv.setFromEuler(e).invert();
        return Array.from({ length: n }, (_, k) => {
          const j = Math.floor(k / cols), inRow = Math.min(cols, n - j * cols), i = k - j * cols;
          view.set((i - (inRow - 1) / 2) * cw, ((rows - 1) / 2 - j) * ch, 0).applyQuaternion(inv).sub(mid);
          return [view.x, view.y, view.z];
        });
      }
      // build one cell per entry on the grid and frame them; no entries hides the cells
      function layout(surfs) {
        const nC = Math.min(4, surfs.length), pos = grid(Math.max(1, nC));
        cellsNow = [];
        for (let k = 0; k < 4; k++) {
          if (k < nC) cellsNow.push(buildCell(k, surfs[k], ...pos[k]));
          else slabs[k].forEach(i => { F.size[i] = 0; });
        }
        setCellBoxes(cellsNow); tintKey = '';
        if (nC) frameDemo(cellsNow);
        laidOut = true; anim = true;
      }
      function pose(r, i) {
        const m = r.m, n = (k, a) => (rand(r.seed * 97 + i * 13 + k, 211) - 0.5) * 2 * a, sm = (k, a, w) => Math.sin(i * w + r.seed * 1.7 + k) * a;
        const fall = Math.exp(-0.26 * i);
        let h, ox, oz, tilt, spin = r.spin0 + i * 0.03, vib = sm(5, 0.035, 1.9) + n(6, 0.01), gone = 1;
        if (m.binds) {
          // drawn in close contact with its metal atom: the spheres just touch at the end
          const hc = RADIUS.Cu + RADIUS[m.atoms[0][0]] * MOL_S - 0.08;
          h = hc + (H0 - hc) * fall * Math.abs(Math.cos(i * 0.32)) + n(1, 0.03) * (1 - fall);
          ox = r.drift[0] * fall + n(2, 0.04); oz = r.drift[1] * fall + n(3, 0.04);
          tilt = 0.9 * fall + sm(4, 0.1, 0.9);
        } else if (m.desorbs) {
          const t13 = Math.min(i, 13), out = Math.max(0, (i - 13) / (r.steps - 13));
          h = 3.2 + (H0 - 3.2) * Math.exp(-0.3 * t13) + out * out * 9 + n(1, 0.08);
          ox = r.drift[0] * (Math.exp(-0.3 * t13) - out * 2.2) + n(2, 0.1); oz = r.drift[1] * (Math.exp(-0.3 * t13) - out * 2.2) + n(3, 0.1);
          tilt = 0.6 + out * 1.4 + sm(4, 0.25, 0.6); spin = r.spin0 + i * 0.12;
          gone = 1 - Math.max(0, (out - 0.85) / 0.15);
        } else {
          h = m.h + (H0 - m.h) * fall + sm(1, 0.22, 0.45) + n(1, 0.06);
          ox = r.drift[0] * fall + sm(2, 0.9, 0.17) * (1 - fall); oz = r.drift[1] * fall + sm(3, 0.7, 0.13) * (1 - fall);
          tilt = 0.5 * fall + sm(4, 0.2, 0.5);
        }
        return { h, ox, oz, tilt, spin, vib, gone };
      }
      function place(r, q) {
        tintKey = '';
        const m = r.m, ct = Math.cos(q.tilt), st = Math.sin(q.tilt), cs = Math.cos(q.spin), ss = Math.sin(q.spin), sc = 1 + q.vib, [cx, cy, cz] = cellsNow[r.k].off;
        r.slots.forEach((i, k) => {
          const at = m.atoms[k];
          if (!at) { F.size[i] = 0; return; }
          let x = at[1] * sc, y = at[2] * sc, z = at[3] * sc;
          const x1 = x * ct - y * st, y1 = x * st + y * ct;
          const x2 = x1 * cs + z * ss, z2 = -x1 * ss + z * cs;
          setLocal(F, i, cx + (x2 + q.ox) * ANG, cy + (q.h + y1) * ANG, cz + (z2 + q.oz) * ANG, rAt(at[0]) * MOL_S, SLOT[at[0]]);
          FADE[i] = q.gone;
        });
      }
      function bonds() { F.meta.bonds = runs.flatMap(r => r.gone > 0.01 ? r.m.bonds.map(([p, k]) => [r.slots[p], r.slots[k], BOND_R * ANG, SLOT.BOND]) : []); }
      // where a molecule binds, the metal atom it touches turns green and the atoms around it take a fainter green
      // that fades with distance, as the bond forms; colours go through F.rgb so the fade can be continuous
      let tintKey = '';
      function tint() {
        const key = glows.map(g => g.v.toFixed(3) + g.at).join() + (pal === tint.pal) + cellsNow.length;
        if (key === tintKey && F.rgb) return;
        tintKey = key; tint.pal = pal;
        if (!F.rgb) F.rgb = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) pal[F.col[i]].toArray(F.rgb, i * 3);
        const ok = pal[SLOT.OK], sig = 2.55 * ANG * 1.05;
        glows.forEach((g, k) => {
          if (g.v < 0.005 || !cellsNow[k]) return;
          const t3 = g.at * 3;
          slabs[k].forEach(i => {
            if (!F.size[i]) return;
            const i3 = i * 3, dd = (F.pos[i3] - F.pos[t3]) ** 2 + (F.pos[i3 + 1] - F.pos[t3 + 1]) ** 2 + (F.pos[i3 + 2] - F.pos[t3 + 2]) ** 2, wv = g.v * Math.exp(-dd / (sig * sig));
            if (wv < 0.01) return;
            for (let c = 0; c < 3; c++) F.rgb[i3 + c] += ([ok.r, ok.g, ok.b][c] - F.rgb[i3 + c]) * wv * 0.9;
          });
        });
        anim = true;
      }
      // clearing fades the molecules out over a quarter second (the next run waits that long), then hides them
      let outT = 0;
      function clearMols() {
        outT = 0.25; beads.forEach(i => { F.size[i] = 0; });
        glows.forEach(g => { g.want = 0; });
      }
      function fadeOut(dt) {
        if (outT <= 0) return;
        outT = Math.max(0, outT - dt); anim = true;
        const a = outT / 0.25, live = new Set(runs.flatMap(r => r.slots));
        atoms.flat().forEach(i => { if (live.has(i)) return; FADE[i] = Math.min(FADE[i], a); if (!outT) { F.size[i] = 0; FADE[i] = 1; } });
        if (!outT) F.meta.bonds = F.meta.bonds.filter(([i]) => live.has(i));
      }
      return {
        act(act, v) {
          // v: [{ surf, mol }] with up to four entries; v.aspect is the viewport's width over height
          if (v && v.aspect) aspect = v.aspect;
          if (act === 'layout') { runs = []; clearMols(); layout((v || []).map(c => c.surf)); orbit0(); }
          if (act === 'run') {
            const list = (v || []).filter(c => MOLS[c.mol] && SURFS[c.surf]).slice(0, 4);
            runs = []; layout(list.map(c => c.surf)); clearMols();
            runs = list.map((c, k) => {
              const [e, h, kd] = (ADS[c.mol] || {})[c.surf] || [0, null, 'd'];
              const m = { ...MOLS[c.mol], e, h, binds: kd === 'c', desorbs: kd === 'd' };
              const seed = c.mol.length * 7 + c.mol.charCodeAt(0) + (c.mol.includes('@') ? 31 : 0) + c.surf.charCodeAt(0) * 3, r0 = rand(seed, 171) * 6.283;
              return { key: c.surf + '|' + c.mol, m, k, slots: atoms[k], seed, spin0: rand(seed, 172) * 6.283, drift: [Math.cos(r0) * 1.6, Math.sin(r0) * 1.2], steps: 30 + 6 * k, step: 0, acc: 0, done: false, started: false, gone: 1 };
            });
            pause = 0.25;
          }
          if (act === 'reset') { runs = []; clearMols(); }
        },
        update(dt, w) {
          if (!laidOut && w(F) > 0.01) layout(['Cu100']);
          const wf = w ? smooth(0.5, 1, w(F)) : 1;
          glows.forEach(g => {
            const gT = g.want * wf;
            if (Math.abs(g.v - gT) > 0.003) { g.v += (gT - g.v) * Math.min(1, dt * 4); anim = true; } else g.v = gT;
          });
          setGlows(); tint(); fadeOut(dt);
          if (!runs.some(r => !r.done)) return;
          anim = true;
          if (pause > 0) { pause -= dt; return; }
          runs.forEach(r => {
            if (r.done) return;
            // a molecule enters from above its cell at full size: it is placed just over the box top at once, then
            // eases down to its first pose
            if (!r.started) { r.started = true; const q0 = pose(r, 0); place(r, { ...q0, h: 15.5 }); r.slots.forEach(i => { if (F.size[i]) enter(i, F); }); place(r, q0); info('demo', { type: 'start', name: r.key }); return; }
            r.acc += dt;
            if (r.acc < STEP_S) return;
            r.acc = 0;
            r.step = reduce ? r.steps : r.step + 1;
            const m = r.m, q = pose(r, r.step), done = r.step >= r.steps, k = 1 - Math.exp(-0.26 * r.step);
            r.gone = q.gone;
            place(r, q);
            if (m.binds && r.step > 8) Object.assign(glows[r.k], { want: 1, at: cellsNow[r.k].top });
            const e = m.desorbs ? m.e * k * (1 - Math.max(0, (r.step - 13) / (r.steps - 13))) : m.e * k + (rand(r.seed * 31 + r.step, 213) - 0.5) * 0.03;
            const hRep = m.desorbs ? (done || q.h > 6 ? null : q.h) : done ? m.h : m.binds ? q.h - (RADIUS.Cu + RADIUS[m.atoms[0][0]] * MOL_S - 0.08) + m.h : q.h;
            r.done = done;
            info('demo', { type: 'step', name: r.key, step: r.step, steps: r.steps, e: done ? (m.desorbs ? 0 : m.e) : e, h: hRep, done, binds: m.binds, desorbed: !!m.desorbs });
          });
          bonds();
          if (runs.every(r => r.done)) info('demo', { type: 'end' });
        }
      };
    })(),
    // parity plot: training-like data hugs the diagonal, new chemistry spreads it out
    bench: (() => {
      const F = forms.bench, { pts, ref, noise } = F.meta;
      let ood = false;
      function set() {
        let ae = 0, se = 0;
        pts.forEach((i, k) => {
          const r = ref[k], sig = ood ? 0.4 : 0.09, bias = ood ? 0.2 * r * Math.abs(r) : 0;
          const pred = clamp(r + bias + noise[k] * sig, -1.8, 1.8), err = pred - r;
          ae += Math.abs(err); se += err * err;
          setLocal(F, i, r, pred, 0, 0.12, Math.abs(err) > 0.35 ? SLOT.A : SLOT.G);
        });
        info('bench', `MAE ${(ae / pts.length).toFixed(2)}, RMSE ${Math.sqrt(se / pts.length).toFixed(2)} eV/atom, illustrative`);
      }
      set();
      return { act(a, v) { if (a === 'ood') { ood = !!v; set(); } }, update() {}, refresh: set };
    })()
  };

  const scatter = new Float32Array(N * 3), delay = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    scatter[i * 3] = (rand(i, 1) - 0.5) * 1.4; scatter[i * 3 + 1] = rand(i, 2) * 1.0 + 0.25; scatter[i * 3 + 2] = (rand(i, 3) - 0.5) * 1.4;
    delay[i] = rand(i, 4) * 0.3;
  }
  const P = new Float32Array(forms.dust.pos), S = new Float32Array(forms.dust.size), C = new Float32Array(N * 3);
  // slate is the cool grey the height ramp and the token edges fade toward; on the light page it is deeper, so the
  // energy surface and its ramp keep their contrast against the pale background
  const slate = new THREE.Color('#7D8698'), isDark = () => document.documentElement.dataset.theme === 'dark';
  const setSlate = () => slate.set(isDark() ? '#7D8698' : '#4E5869');
  setSlate();
  const ink = () => (getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#131722');
  const palette = () => { setSlate(); return PALETTE.map(h => Array.isArray(h) ? new THREE.Color(h[isDark() ? 0 : 1]) : typeof h === 'number' ? new THREE.Color(getAccent()).lerp(slate, h) : h === 'ink' ? new THREE.Color(ink()).lerp(slate, 0.25) : new THREE.Color(h || getAccent())); };
  // the theme changes the ink colour of sketch lines, so rebuild the palette when it flips
  new MutationObserver(() => { pal = palette(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  let pal = palette(), lastAccent = getAccent();
  for (let i = 0; i < N; i++) { const c = pal[forms.dust.col[i]]; C[i * 3] = c.r; C[i * 3 + 1] = c.g; C[i * 3 + 2] = c.b; }

  // a controller can jump a particle straight to its target, for loops that wrap around
  function snapTo(i, F, j) { if (shownA !== F && shownB !== F) return; for (let a = 0; a < 3; a++) { P[i * 3 + a] = P[j * 3 + a]; } S[i] = 0; }
  // a particle that appears where its formation puts it, already at full size and colour
  function enter(i, F) { if (shownA !== F && shownB !== F) return; for (let a = 0; a < 3; a++) P[i * 3 + a] = F.pos[i * 3 + a]; S[i] = F.size[i]; pal[F.col[i]].toArray(C, i * 3); anim = true; }
  function snap(i, F) { if (shownA !== F && shownB !== F) return; for (let a = 0; a < 3; a++) { P[i * 3 + a] = F.pos[i * 3 + a]; } S[i] = 0; }
  // a soft green radial glow on a demo site atom when a molecule binds there, one per molecule
  const glows = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(110,235,160,0.9)'); grd.addColorStop(0.35, 'rgba(63,169,107,0.45)'); grd.addColorStop(1, 'rgba(63,169,107,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const mat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    return [0, 1, 2, 3].map(() => { const sp = new THREE.Sprite(mat.clone()); sp.scale.setScalar(5.5 * ANG); sp.visible = false; holder.add(sp); return { sp, v: 0, want: 0, at: 0 }; });
  })();
  // around the first skills scene, more small molecules out of focus, behind it and a few in front. They are soft
  // round points in one draw call (no spheres, no blur pass); the farther from the scene's plane, the larger and
  // softer the spot. They hold still, so the engine can still stop drawing when the scene settles.
  const haze = (() => {
    const TPL = BG_MOLS.concat([
      [[['C', 0.67, 0, 0], ['C', -0.67, 0, 0], ['H', 1.23, 0.92, 0], ['H', 1.23, -0.92, 0], ['H', -1.23, 0.92, 0], ['H', -1.23, -0.92, 0]], [[0, 1], [0, 2], [0, 3], [1, 4], [1, 5]]],
      [[['N', 0.55, 0, 0], ['N', -0.55, 0, 0]], [[0, 1]]],
      [[['C', 0, 0, 0], ['O', 1.13, 0, 0]], [[0, 1]]]
    ]);
    const pos = [], col = [], size = [], soft = [], e = new THREE.Euler(), v = new THREE.Vector3(), spots = [], M = coarse ? 9 : 14, c0 = forms.aiMols.center;
    for (let m = 0, tries = 0; m < M && tries < 4000; tries++) {
      const front = rand(tries, 314) < 0.15, at = { x: -7 + rand(tries, 311) * (front ? 17 : 20), y: (rand(tries, 312) - 0.5) * (front ? 9 : 12), z: front ? 3 + rand(tries, 313) * 2 : -4 - rand(tries, 313) * 7 };
      // the middle stays clear for the systems in focus, and the spots keep right of the text on the left
      // (tested where the spot lands on screen: farther spots drift toward the middle with perspective)
      const pk = 17 / (17 - at.z);
      if (Math.abs(at.x - 1.5) * pk < (front ? 7.5 : 5.8) && Math.abs(at.y) * pk < (front ? 4 : 3)) continue;
      if (spots.some(p => Math.hypot(p.x - at.x, p.y - at.y, (p.z - at.z) * 0.5) < 3)) continue;
      spots.push(at);
      const [atoms, bonds] = TPL[m % TPL.length], blur = Math.min(1, 0.45 + Math.abs(at.z) / 9), k = ANG * 1.25;
      e.set(rand(m, 315) * 6.3, rand(m, 316) * 6.3, rand(m, 317) * 6.3);
      const xyz = atoms.map(([el, x, y, z]) => v.set(x, y, z).applyEuler(e).clone());
      const add = (p, r, c, sf) => { pos.push(c0.x + at.x + p.x * k, c0.y + at.y + p.y * k, c0.z + at.z + p.z * k); col.push(c); size.push(r); soft.push(sf); };
      atoms.forEach(([el], i) => add(xyz[i], (RADIUS[el] || 0.3) * k * (1.4 + blur * 2.4), SLOT[el], 0.8 + 0.2 * blur));
      bonds.forEach(([a, b]) => add(xyz[a].clone().add(xyz[b]).multiplyScalar(0.5), BOND_R * k * (2 + blur * 5), SLOT.BOND, 1));
      m++;
    }
    const n = size.length, geo = new THREE.BufferGeometry(), rgb = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(rgb, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(size), 1));
    geo.setAttribute('aSoft', new THREE.BufferAttribute(new Float32Array(soft), 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false, vertexColors: true,
      uniforms: { uScale: { value: 1 }, uAlpha: { value: 0 } },
      vertexShader: `attribute float aSize; attribute float aSoft; uniform float uScale; varying vec3 vCol; varying float vSoft;
        void main() { vCol = color; vSoft = aSoft; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(2.0 * aSize * uScale / -mv.z, 320.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uAlpha; varying vec3 vCol; varying float vSoft;
        void main() { float d = length(gl_PointCoord * 2.0 - 1.0), a = 1.0 - smoothstep(1.0 - vSoft, 1.0, d); a *= a; if (a < 0.01) discard; gl_FragColor = vec4(vCol, a * uAlpha); }`
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false; pts.visible = false; pts.renderOrder = -1;
    holder.add(pts);
    const hGrey = new THREE.Color('#8E96A3'), tc = new THREE.Color();
    return { pts, mat, rgb, geo, col, paint(pal) {
      const light = !isDark();
      col.forEach((c, i) => { tc.copy(light && (c === SLOT.H || c === SLOT.L) ? hGrey : pal[c]); if (light) tc.multiplyScalar(0.82); tc.toArray(rgb, i * 3); });
      geo.attributes.color.needsUpdate = true;
    } };
  })();
  function setGlows() {
    const t = 0.85 + 0.15 * Math.sin(performance.now() / 500);
    glows.forEach(({ sp, v, at }) => {
      sp.visible = v > 0.005;
      if (!sp.visible) return;
      const s0 = at * 3;
      sp.position.set(forms.demo.pos[s0], forms.demo.pos[s0 + 1] + 0.6 * ANG, forms.demo.pos[s0 + 2]);
      sp.material.opacity = v * t;
    });
  }
  // the simulation cell of the demo, as thin lines that fade with the formation
  const cellPos = new Float32Array(24 * 3 * 4), cellGeo = new THREE.BufferGeometry();
  function setCellBoxes(list) {
    cellPos.fill(0);
    list.forEach(({ min, max }, ci) => {
      const e = forms.demo.meta.euler, c = [];
      for (let k = 0; k < 8; k++) c.push(new THREE.Vector3(k & 1 ? max[0] : min[0], k & 2 ? max[1] : min[1], k & 4 ? max[2] : min[2]).applyEuler(e));
      [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b], k) => { cellPos.set([c[a].x, c[a].y, c[a].z, c[b].x, c[b].y, c[b].z], (ci * 12 + k) * 6); });
    });
    if (cellGeo.attributes.position) cellGeo.attributes.position.needsUpdate = true;
  }
  // the camera frames the cells of the current batch
  function frameDemo(list) {
    const e = forms.demo.meta.euler, v = new THREE.Vector3(), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    list.forEach(({ min, max }) => { for (let k = 0; k < 8; k++) { v.set(k & 1 ? max[0] : min[0], k & 2 ? max[1] : min[1], k & 4 ? max[2] : min[2]).applyEuler(e); [v.x, v.y, v.z].forEach((c, a) => { lo[a] = Math.min(lo[a], c); hi[a] = Math.max(hi[a], c); }); } });
    const ex = (hi[0] - lo[0]) / 2, ey = (hi[1] - lo[1]) / 2, ez = (hi[2] - lo[2]) / 2;
    forms.demo.center.set((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    // the whole width of the outer cells stays in the viewport (narrow phone viewports cut them off before); the
    // height keeps its tighter framing
    forms.demo.ext = { x: Math.max(1, ex * 1.02 + ez * 0.14) * 0.9, y: Math.max(0.6, ey * 1.04 + ez * 0.12) * 0.84 };
  }
  setCellBoxes(forms.demo.meta.cells);
  cellGeo.setAttribute('position', new THREE.BufferAttribute(cellPos, 3));
  const cellMat = new THREE.LineBasicMaterial({ color: '#7D8698', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const cellLines = new THREE.LineSegments(cellGeo, cellMat);
  cellLines.frustumCulled = false;
  holder.add(cellLines);
  // the token stream: on the way from the energy surface to the rings, the surface leaves as tokens, short pieces of
  // words rising off its points like text streaming out of a model. Glyphs are drawn from an atlas in the 3D scene,
  // so they pick up the same blur and lens as the particles. Scroll-driven, so it plays backwards too.
  const GLYPH_TEXT = ['sim', 'ul', 'ations', 'chem', 'istry', 'ad', 'sorption', 'E', 'CO', '\u2082', 'Cu', '(100)', 'eV', 'relax', 'ation', 'energy', 'surf', 'ace', 'DFT', 'ML', 'IP', 'force', 'basis', 'mol', 'ecule', 'bond', 'H', 'O', 'N', 'C', '\u0394E', 'kT', 'path', 'TS', 'react', 'ion', 'data', 'set', 'train', 'ing'];
  const GLYPHS = coarse ? 90 : 150, CELL_W = 128, CELL_H = 48, ACOLS = 8, AROWS = Math.ceil(GLYPH_TEXT.length / ACOLS);
  const atlas = document.createElement('canvas');
  atlas.width = CELL_W * ACOLS * 2; atlas.height = CELL_H * AROWS * 2;   // drawn at 2x for sharp glyphs
  {
    const g = atlas.getContext('2d');
    g.scale(2, 2); g.fillStyle = '#fff'; g.font = '600 24px "Roboto Mono", ui-monospace, Menlo, monospace'; g.textBaseline = 'middle'; g.textAlign = 'center';
    GLYPH_TEXT.forEach((t, k) => g.fillText(t, (k % ACOLS + 0.5) * CELL_W, (Math.floor(k / ACOLS) + 0.5) * CELL_H));
  }
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.generateMipmaps = true; atlasTex.minFilter = THREE.LinearMipmapLinearFilter; atlasTex.anisotropy = 4;
  const gPos = new Float32Array(GLYPHS * 3), gCell = new Float32Array(GLYPHS), gAlpha = new Float32Array(GLYPHS), gGeo = new THREE.BufferGeometry();
  for (let i = 0; i < GLYPHS; i++) gCell[i] = Math.floor(rand(i, 101) * GLYPH_TEXT.length);
  gGeo.setAttribute('position', new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage));
  gGeo.setAttribute('aCell', new THREE.BufferAttribute(gCell, 1));
  gGeo.setAttribute('aAlpha', new THREE.BufferAttribute(gAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const gMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, premultipliedAlpha: true,
    uniforms: { uAtlas: { value: atlasTex }, uColor: { value: new THREE.Color(getAccent()) }, uSize: { value: 1 }, uGrid: { value: new THREE.Vector2(ACOLS, AROWS) } },
    vertexShader: `attribute float aCell; attribute float aAlpha; uniform float uSize; varying float vCell; varying float vAlpha;
      void main() { vCell = aCell; vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(uSize / -mv.z, 420.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uAtlas; uniform vec3 uColor; uniform vec2 uGrid; varying float vCell; varying float vAlpha;
      void main() {
        vec2 p = gl_PointCoord; float h = ${(CELL_H / CELL_W).toFixed(4)};
        if (abs(p.y - 0.5) > h * 0.5 || vAlpha < 0.01) discard;
        // round the glyph index first: an interpolated 15.9999 would otherwise jump to the neighbouring glyph
        float id = floor(vCell + 0.5), row = floor((id + 0.5) / uGrid.x);
        vec2 cell = vec2(id - row * uGrid.x, row);
        vec2 uv = vec2((cell.x + p.x) / uGrid.x, 1.0 - (cell.y + (p.y - 0.5) / h + 0.5) / uGrid.y);
        float a = texture2D(uAtlas, uv).a * vAlpha;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor * a, a);   // premultiplied, so edges blend cleanly on light and dark
      }`
  });
  const glyphs = new THREE.Points(gGeo, gMat);
  glyphs.frustumCulled = false;
  holder.add(glyphs);
  // each glyph leaves from a point of the surface at its own moment, rises and drifts, then fades out of frame
  const gFrom = Array.from({ length: GLYPHS }, (_, i) => Math.floor(rand(i, 102) * Math.min(N, 28 * 28)));
  const gOut = Array.from({ length: GLYPHS }, (_, i) => rand(i, 106) < 0.12), camLocal = new THREE.Vector3();
  // sideways drift for tokens leaving through the screen: about half straight, most of the rest to the right
  const gSide = Array.from({ length: GLYPHS }, (_, i) => { const r = rand(i, 107); return r < 0.45 ? [0, 0] : r < 0.8 ? [0.7 + rand(i, 108) * 0.6, 0.1] : r < 0.92 ? [0.1, 0.6] : [-0.6, 0.05]; });
  const gStart = Array.from({ length: GLYPHS }, (_, i) => rand(i, 103) * 0.55), gDrift = Array.from({ length: GLYPHS }, (_, i) => (rand(i, 104) - 0.5) * 1.2);
  function paintGlyphs(stopNow) {
    const u = forced ? -1 : stopNow - ORDER.indexOf('aiPes');
    glyphs.visible = u > 0.01 && u < 0.99;
    if (!glyphs.visible) return;
    anim = true;
    const F = forms.aiPes, top = 5.5;
    gMat.uniforms.uColor.value.set(getAccent());
    holder.updateMatrixWorld(); camLocal.copy(camera.position); holder.worldToLocal(camLocal);
    // a glyph cell is about 1.1 units wide in the scene: convert to pixels at unit distance for this view
    gMat.uniforms.uSize.value = 1.1 * H * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
    for (let i = 0; i < GLYPHS; i++) {
      const p = clamp((u - gStart[i]) / 0.45), j = gFrom[i] * 3, e = p * p;
      if (gOut[i]) {
        // a few tokens come toward the viewer and leave through the screen: they grow with perspective and fade
        // just before they would reach the camera
        // along its own line of sight: it keeps its place on screen and grows straight at the viewer; some drift
        // a little sideways, mostly right, a few up or left
        const ez = p * p * p, s2 = 0.9 * ez;
        gPos[i * 3] = F.pos[j] + (camLocal.x - F.pos[j]) * s2 + gSide[i][0] * ez;
        gPos[i * 3 + 1] = F.pos[j + 1] + (camLocal.y - F.pos[j + 1]) * s2 + gSide[i][1] * ez;
        gPos[i * 3 + 2] = F.pos[j + 2] + (camLocal.z - F.pos[j + 2]) * s2;
        gAlpha[i] = smooth(0, 0.18, p) * (1 - smooth(0.82, 0.98, p));
        continue;
      }
      gPos[i * 3] = F.pos[j] + gDrift[i] * e;
      gPos[i * 3 + 1] = F.pos[j + 1] + e * top;
      gPos[i * 3 + 2] = F.pos[j + 2] * (1 - 0.6 * e);
      gAlpha[i] = smooth(0, 0.18, p) * (1 - smooth(0.6, 1, p));
    }
    gGeo.attributes.position.needsUpdate = true;
    gGeo.attributes.aAlpha.needsUpdate = true;
  }
  // connection lines for formations that have edges; endpoints follow the live particles
  const netEdges = forms.aiNet.meta.edges, edgePos = new Float32Array(netEdges.length * 6), edgeCol = new Float32Array(netEdges.length * 6);
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePos, 3).setUsage(THREE.DynamicDrawUsage));
  edgeGeo.setAttribute('color', new THREE.BufferAttribute(edgeCol, 3).setUsage(THREE.DynamicDrawUsage));
  const edgeMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
  edgeLines.frustumCulled = false;
  holder.add(edgeLines);
  const edgeBase = new THREE.Color(getAccent()).lerp(slate, 0.85), edgeHot = new THREE.Color(), ec = new THREE.Color();
  function paintEdges(weight) {
    const w = weight(forms.aiNet);
    edgeLines.visible = w > 0.02;
    if (!edgeLines.visible) return;
    edgeMat.opacity = 0.55 * smooth(0.3, 1, w);
    edgeHot.set(getAccent());
    const clock = (performance.now() - t0) / 1000, xs = forms.aiNet.meta.xs, span = xs[xs.length - 1] - xs[0];
    netEdges.forEach(([a, b], k) => {
      [a, b].forEach((i, e) => {
        const o = k * 6 + e * 3;
        edgePos[o] = P[i * 3]; edgePos[o + 1] = P[i * 3 + 1]; edgePos[o + 2] = P[i * 3 + 2];
        const xl = forms.aiNet.meta.local[i].x, run = forms.aiNet.meta.pulse, h = run < 0 ? 0 : Math.exp(-(((xl - xs[0]) / span - (run * 1.4 - 0.2)) ** 2) / 0.03);
        ec.copy(edgeBase).lerp(edgeHot, h);
        edgeCol[o] = ec.r; edgeCol[o + 1] = ec.g; edgeCol[o + 2] = ec.b;
      });
    });
    edgeGeo.attributes.position.needsUpdate = true;
    edgeGeo.attributes.color.needsUpdate = true;
  }
  // the cursor pulls nearby atoms together; atoms that come close enough get a bond
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3(), cur = new THREE.Vector3();
  const PR = 2.6, BOND = 0.62, MAXB = 180, near = new Int32Array(140), nb = new Uint8Array(N);
  let ptr = null, hot = 0, bondsSeen = false, clearBox = null;
  const lv2 = new THREE.Vector3();
  const bondPos = new Float32Array(MAXB * 6), bondGeo = new THREE.BufferGeometry();
  bondGeo.setAttribute('position', new THREE.BufferAttribute(bondPos, 3).setUsage(THREE.DynamicDrawUsage));
  const bondMat = new THREE.LineBasicMaterial({ color: getAccent(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const bondLines = new THREE.LineSegments(bondGeo, bondMat);
  bondLines.frustumCulled = false;
  holder.add(bondLines);
  function paintBonds() {
    bondLines.visible = hot > 0.03;
    if (!bondLines.visible) return;
    let n = 0, m = 0;
    for (let i = 0; i < N && n < near.length; i++) {
      if (S[i] < 0.03) continue;
      const dx = P[i * 3] - cur.x, dy = P[i * 3 + 1] - cur.y;
      if (dx * dx + dy * dy < PR * PR * 0.6) { near[n++] = i; nb[i] = 0; }
    }
    for (let a = 0; a < n && m < MAXB; a++) for (let b = a + 1; b < n && m < MAXB; b++) {
      const i = near[a], j = near[b];
      if (nb[i] > 2 || nb[j] > 2) continue;
      const dx = P[i * 3] - P[j * 3], dy = P[i * 3 + 1] - P[j * 3 + 1], dz = P[i * 3 + 2] - P[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz > BOND * BOND) continue;
      nb[i]++; nb[j]++;
      bondPos.set([P[i * 3], P[i * 3 + 1], P[i * 3 + 2], P[j * 3], P[j * 3 + 1], P[j * 3 + 2]], m * 6);
      m++;
    }
    bondGeo.setDrawRange(0, m * 2);
    bondGeo.attributes.position.needsUpdate = true;
    bondMat.color.set(getAccent());
    bondMat.opacity = Math.min(1, 1.2 * hot);
    if (m > 3 && !bondsSeen && hot > 0.6) { bondsSeen = true; info('bonds', m); }
  }
  const tg = [0, 0, 0], tcA = new THREE.Color(), tcB = new THREE.Color();
  // aclock runs only while the engine draws, so ambient sway resumes where it stopped; anim marks running animations
  // the demo's cells can be orbited by dragging in its viewport: a turn about the vertical and a tilt, held until
  // the next layout, which eases them back to the set view
  let orbY = 0, orbX = 0, orbYTo = 0, orbXTo = 0;
  let demoZoom = 1;
  const TELE = 3;
  function orbit0() { orbYTo = orbXTo = 0; demoZoom = 1; }
  let swayY = 0, aclock = 0, anim = false, animating = false, settled = false, dirty = true;
  const bA = new THREE.Vector3(), bB = new THREE.Vector3(), bD = new THREE.Vector3(), bQ = new THREE.Quaternion(), bS = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), bM = new THREE.Matrix4();
  function paintBondMesh(A, B, t) {
    let n = 0;
    const pass = (F, w) => {
      if (w < 0.05 || !F.meta.bonds) return;
      const fade = smooth(0.35, 1, w) * (F.meta.bondFade ?? 1);
      for (const [i, j, r, c] of F.meta.bonds) {
        if (n >= BMAX) break;
        if (S[i] < F.size[i] * 0.4 || S[j] < F.size[j] * 0.4) continue;
        bA.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); bB.set(P[j * 3], P[j * 3 + 1], P[j * 3 + 2]);
        bD.subVectors(bB, bA); const len = bD.length();
        if (len < 1e-4) continue;
        bQ.setFromUnitVectors(UP, bD.multiplyScalar(1 / len));
        bS.set(r * fade * partK, len, r * fade * partK);
        bM.compose(bA.add(bB).multiplyScalar(0.5), bQ, bS);
        bondMesh.setMatrixAt(n, bM);
        bondMesh.setColorAt(n, pal[c]);
        bFade.array[n] = Math.min(aFade.array[i], aFade.array[j]);
        n++;
      }
    };
    if (A === B) pass(A, 1); else { pass(A, 1 - t); pass(B, t); }
    bondMesh.count = n;
    bondMesh.instanceMatrix.needsUpdate = true; bFade.needsUpdate = true;
    if (bondMesh.instanceColor) bondMesh.instanceColor.needsUpdate = true;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const camCenter = forms.dust.center.clone(), camTarget = new THREE.Vector3();
  let photoOn = false, scrubT = 0, partK = 1, keepK = 1;
  let camDist = 15.5, stop = 0, forced = null, motion = 0, last = performance.now(), t0 = last, offX = 0, offY = 0, fitW = 0.55, fitH = 0.62, W = 1, H = 1;
  let shownA = forms.dust, shownB = forms.dust, shownT = 0;
  function size() {
    const r = canvas.getBoundingClientRect();
    renderer.setPixelRatio(software ? 1 : Math.min(prCap, window.devicePixelRatio || 1));
    renderer.setSize(r.width, r.height, false);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(W, H);
    composerSoft.setPixelRatio(renderer.getPixelRatio());
    composerSoft.setSize(W, H);
    composerLo.setPixelRatio(renderer.getPixelRatio() * 0.5);
    composerLo.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { size(); dirty = true; }).observe(canvas);
  size();
  // distance at which a formation's half-width and half-height fit the allowed fraction of the view
  // cover = 1 fills the view instead of fitting inside it, for the atom field on any screen shape
  const fitDist = (ex, ey, cover = 0) => { const tv = Math.tan(THREE.MathUtils.degToRad(15)), a = ey / (tv * fitH), b = ex / (tv * camera.aspect * fitW); return Math.max(a, b) * (1 - cover) + Math.min(a, b) * cover; };

  function render(now) {
    const frameDt = Math.min(0.25, Math.max(1 / 240, (now - last) / 1000));
    last = now;
    aclock += frameDt;
    if (getAccent() !== lastAccent) { lastAccent = getAccent(); pal = palette(); edgeBase.set(getAccent()).lerp(slate, 0.85); }
    let A, B, t;
    if (forced && forms[forced]) { A = B = forms[forced]; t = 1; }
    else {
      const s = clamp(stop, 0, ORDER.length - 1), a = Math.floor(s), b = Math.min(ORDER.length - 1, a + 1);
      A = forms[ORDER[a]]; B = forms[ORDER[b]]; t = smooth(0.1, 0.9, s - a);
    }
    shownA = A; shownB = B; shownT = t;
    const weight = F => A === B ? (A === F ? 1 : 0) : (A === F ? 1 - t : 0) + (B === F ? t : 0);
    const clock = (now - t0) / 1000;
    Object.values(CTRL).forEach(c => c.update(frameDt, weight, clock));
    // camera re-frames to fit whatever is forming
    camTarget.copy(A.center).lerp(B.center, t);
    const dive = A === forms.dust && B !== forms.dust ? 1 - 0.55 * Math.sin(Math.PI * t) : 1;
    // molecular scenes share one camera distance (the one that fits the widest of them), so an atom appears the
    // same size on screen in every scene; other scenes fit their own extent
    // scenes in one family share a camera distance (the one that fits the widest of them), so an atom appears the
    // same size on screen across them; atom radii are the same in every scene
    const famDist = fam => Math.max(...MOL_FORMS.filter(F => F.meta.mol === fam).map(F => fitDist(F.ext.x, F.ext.y)));
    const dOf = F => F.meta.mol ? famDist(F.meta.mol) : null, molDist = dOf(A) ?? dOf(B);
    const dA = dOf(A), dB = dOf(B), fitAB = fitDist(A.ext.x + (B.ext.x - A.ext.x) * t, A.ext.y + (B.ext.y - A.ext.y) * t, weight(forms.dust));
    const wantDist = dive * (dA !== null && dB !== null ? dA + (dB - dA) * t : dA !== null ? dA + (fitAB - dA) * t : dB !== null ? fitAB + (dB - fitAB) * t : fitAB), kk = reduce ? 1 : Math.min(1, frameDt * 3);
    // the illustration shot keeps one camera pose on every screen, so the Blender photo of it lines up: the distance
    // is fixed (a reference frame of 0.55 x 0.6 at 16:10) and the fit to this screen is done with zoom, which only scales
    const wIll = weight(forms.illModel), tvI = Math.tan(THREE.MathUtils.degToRad(15)), ext = forms.illModel.ext;
    const dIll = Math.max(ext.y / (tvI * 0.6), ext.x / (tvI * 1.6 * 0.55)), fitIll = fitDist(ext.x, ext.y);
    const tele = 1 + (TELE - 1) * weight(forms.demo);
    const wantD = (wantDist + (dIll - wantDist) * wIll) * (1 + (1 / demoZoom - 1) * weight(forms.demo)) * tele;
    clayU.uClay.value = wIll; clayU.uSketch.value = weight(forms.illSketch);
    if (clayU.uSketch.value > 0 && clayU.pal !== pal) { clayU.pal = pal; clayU.uPaper.value.set(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#F3F5F9'); }
    // while the rendered photo is up, the particles under it stay hidden; they grow back in as the photo dissolves
    // and the next scene forms
    // both ease over about the time the photo takes to sweep in, so the clay leaves as the render arrives and nothing
    // of it shows through the render's clear glass
    const ek = Math.min(1, frameDt * 5), keepT = photoOn ? 0 : 1, partT = photoOn ? smooth(0.25, 0.8, 1 - wIll) : 1;
    if (Math.abs(keepK - keepT) > 0.002 || Math.abs(partK - partT) > 0.002) { keepK += (keepT - keepK) * ek; partK += (partT - partK) * ek; anim = true; }
    else { keepK = keepT; partK = partT; }
    if (dis.pts.visible) { dis.mat.uniforms.uD.value = camDist; dis.mat.uniforms.uCell.value = H * renderer.getPixelRatio() * camera.zoom / dis.rows; }
    camera.zoom = (1 + (dIll / fitIll - 1) * wIll) * tele;
    if (forms.illModel.meta.frozen && wIll > 0.5) { camCenter.copy(camTarget); camDist = wantD; }
    else { camCenter.lerp(camTarget, kk); camDist += (wantD - camDist) * kk; }
    camera.position.set(camCenter.x, camCenter.y + camDist * 0.04, camCenter.z + camDist);
    camera.lookAt(camCenter);
    camera.updateMatrixWorld(); holder.updateMatrixWorld();
    const time = (now - t0) / 1000;
    const burst = A.meta.calm || B.meta.calm ? 0 : Math.max(A.meta.burst || 1, B.meta.burst || 1);
    const stillW = (A.meta.still ? 1 - t : 0) + (B.meta.still ? t : 0);
    const wd = weight(forms.dust);
    hot += ((ptr && wd > 0.3 ? wd : 0) - hot) * Math.min(1, frameDt * 4);
    if (ptr && !reduce) {
      holder.updateMatrixWorld(); camera.updateMatrixWorld();
      ndc.set(ptr.x / W * 2 - 1, 1 - ptr.y / H * 2);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit)) holder.worldToLocal(cur.copy(hit));
    }
    // each particle eases toward its target in one step per frame; the momentum comes from the one spring on the
    // scroll position, so no per-particle physics is needed. The slow bob is added only when drawing, so the
    // particles themselves come to rest and the engine can stop drawing
    let speed = 0, err = 0, live = 0;
    const IM = mesh.instanceMatrix.array, IC = mesh.instanceColor.array;
    const kp = reduce ? 1 : 1 - Math.exp(-frameDt * 9), ks = reduce ? 1 : 1 - Math.exp(-frameDt * 7), bobAmp = reduce ? 0 : 0.03 * (1 - stillW);
    for (let i = 0; i < N; i++) {
      const ti = clamp((t - delay[i]) / 0.7), e = ti * ti * (3 - 2 * ti), lift = A === B ? 0 : Math.sin(Math.PI * ti) * burst;
      const k3 = i * 3;
      for (let a = 0; a < 3; a++) {
        const d = A.pos[k3 + a] + (B.pos[k3 + a] - A.pos[k3 + a]) * e + scatter[k3 + a] * lift - P[k3 + a];
        P[k3 + a] += d * kp;
        const ad = Math.abs(d);
        speed += ad * kp; if (ad > err) err = ad;
      }
      const sTarget = A.size[i] + (B.size[i] - A.size[i]) * e, ds = sTarget - S[i];
      S[i] += ds * ks; if (Math.abs(ds) > err) err = Math.abs(ds);
      // a formation can carry its own per-particle colours (the image mosaics); otherwise colours come from slots
      const ca = A.rgb ? tcA.fromArray(A.rgb, k3) : pal[A.col[i]], cb = B.rgb ? tcB.fromArray(B.rgb, k3) : pal[B.col[i]], f = Math.min(1, frameDt * 5);
      const dr = ca.r + (cb.r - ca.r) * e - C[k3], dg = ca.g + (cb.g - ca.g) * e - C[k3 + 1], db = ca.b + (cb.b - ca.b) * e - C[k3 + 2];
      C[k3] += dr * f; C[k3 + 1] += dg * f; C[k3 + 2] += db * f;
      const dc = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db)); if (dc > err) err = dc;
      // each instance is a uniform scale plus a translation, so its matrix goes straight into the buffer
      const o = i * 16, sp = S[i] * partK, si = Math.max(0.0001, sp);
      if (sp > 0.0001) live = i + 1;
      IM[o] = IM[o + 5] = IM[o + 10] = si;
      IM[o + 12] = P[k3]; IM[o + 13] = P[k3 + 1] + Math.sin(aclock * 1.2 + i * 0.37) * bobAmp; IM[o + 14] = P[k3 + 2];
      IC[k3] = C[k3]; IC[k3 + 1] = C[k3 + 1]; IC[k3 + 2] = C[k3 + 2];
    }
    paintEdges(weight);
    paintGlyphs(clamp(stop, 0, ORDER.length - 1));
    cellMat.opacity = 0.55 * smooth(0.4, 1, weight(forms.demo)); cellLines.visible = cellMat.opacity > 0.01;
    haze.mat.uniforms.uAlpha.value = (isDark() ? 0.5 : 0.42) * smooth(0.35, 1, weight(forms.aiMols)); haze.pts.visible = haze.mat.uniforms.uAlpha.value > 0.01;
    if (haze.pts.visible) { if (haze.pal !== pal) { haze.paint(pal); haze.pal = pal; } haze.mat.uniforms.uScale.value = H * renderer.getPixelRatio() / (2 * Math.tan(THREE.MathUtils.degToRad(15))); }
    paintBonds();
    motion = clamp(speed / Math.max(frameDt, 1e-3) / N / 4);
    settled = err < 0.002 && !anim;
    animating = anim;
    anim = false;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    const wFade = weight(forms.demo), fa = aFade.array;
    let fd = false;
    for (let i = 0; i < N; i++) { const f = wFade > 0 ? 1 - (1 - FADE[i]) * wFade : 1; if (fa[i] !== f) { fa[i] = f; fd = true; } }
    if (fd) aFade.needsUpdate = true;
    // the particles after the last visible one are all at the 0.0001 floor, too small to cover a pixel: leave them undrawn
    mesh.count = live;
    paintBondMesh(A, B, t);
    // the held photo does not sway
    if (!(forms.illModel.meta.frozen && weight(forms.illModel) > 0.5)) swayY = reduce ? 0 : Math.sin(aclock * 0.22) * 0.12 * (1 - weight(forms.illModel));
    const wDemo = weight(forms.demo), ko = reduce ? 1 : Math.min(1, frameDt * 10);
    if (Math.abs(orbYTo - orbY) + Math.abs(orbXTo - orbX) > 1e-4) { orbY += (orbYTo - orbY) * ko; orbX += (orbXTo - orbX) * ko; anim = true; } else { orbY = orbYTo; orbX = orbXTo; }
    holder.rotation.y = swayY * (1 - wDemo) + (forms.illModel.meta.orbit || 0) * weight(forms.illModel) + orbY * wDemo;
    holder.rotation.x = orbX * wDemo;
    camera.setViewOffset(W, H, -offX * W, -offY * H, W, H);
    // the colour fringe shows only while things move; at rest edges stay clean
    // the illustration's preview is raw: no colour fringe or motion blur there
    const lensK = 1 - weight(forms.illModel);
    lens.uniforms.uAmount.value = reduce ? 0 : (0.0015 + motion * 0.014) * lensK;
    lens.uniforms.uSeed.value = (now % 1000) * 0.013;
    // half resolution from 12 px of defocus, back to full below 9 px (thin lines alias at half resolution under a
    // lighter blur); the gap keeps small scrolls near the edge from flipping it
    lowRes = defocus > (lowRes ? 9 : 12);
    const pr = renderer.getPixelRatio() * (lowRes ? 0.5 : 1);
    lens.uniforms.uBlur.value = reduce ? 0 : Math.min(glyphs.visible ? 1.2 : 6, motion * 9) * pr * lensK;
    lens.uniforms.uTexel.value.set(1 / (W * pr), 1 / (H * pr));
    blurX.enabled = blurY.enabled = defocus > 0.3;
    for (const b of [blurX, blurY]) { b.uniforms.uRadius.value = defocus * pr; b.uniforms.uTexel.value.copy(lens.uniforms.uTexel.value); }
    const timed = tq && tqPending.length < 4;
    let gq = null;
    if (timed) { gq = gl.createQuery(); gl.beginQuery(tq.TIME_ELAPSED_EXT, gq); }
    (lowRes ? composerLo : blurX.enabled ? composerSoft : composer).render();
    if (gq) {
      gl.endQuery(tq.TIME_ELAPSED_EXT);
      // only frames drawn back to back while something moves say how fast the GPU is (at rest it clocks down)
      tqPending.push({ q: gq, sample: !lowRes && frameDt < 0.05 && (motion > 0.004 || animating), meta: { t: now, stop, defocus, lowRes, blurOn: blurX.enabled, blur: lens.uniforms.uBlur.value, calls: renderer.info.render.calls, tris: renderer.info.render.triangles } });
    }
    readGpu(now);
    if (PERF_SYNC) renderer.getContext().finish();
  }
  // collect finished GPU timings; when frames keep taking over 12 ms, step the resolution down once
  function readGpu(now) {
    if (!tq) return;
    const disjoint = gl.getParameter(tq.GPU_DISJOINT_EXT);
    while (tqPending.length && gl.getQueryParameter(tqPending[0].q, gl.QUERY_RESULT_AVAILABLE)) {
      const { q, sample, meta } = tqPending.shift(), ms = disjoint ? -1 : gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(q);
      if (ms < 0) continue;
      if (gpuCb) gpuCb(ms, meta);
      if (!sample || now < governFrom) continue;
      gpuSamples.push(ms);
      if (gpuSamples.length < 40) continue;
      const p75 = gpuSamples.sort((a, b) => a - b)[29], i = PR_STEPS.indexOf(prCap);
      gpuSamples.length = 0;
      if (p75 > 12 && i >= 0 && i < PR_STEPS.length - 1 && renderer.getPixelRatio() > PR_STEPS[i + 1]) { prCap = PR_STEPS[i + 1]; size(); dirty = true; governFrom = now + 1000; }
    }
  }
  const lv = new THREE.Vector3();
  function labels() {
    const out = [], F = shownT < 0.5 ? shownA : shownB, alpha = shownA === shownB ? 1 : Math.abs(shownT - 0.5) * 2;
    if (alpha < 0.05) return out;
    holder.updateMatrixWorld();
    camera.updateMatrixWorld();
    (F.meta.labels || []).forEach(L => {
      lv.set(P[L.i * 3], P[L.i * 3 + 1], P[L.i * 3 + 2]).applyMatrix4(holder.matrixWorld).project(camera);
      if (lv.z > 1) return;
      out.push({ text: L.text, side: L.side || 'r', x: (lv.x + 1) / 2 * W, y: (1 - lv.y) / 2 * H, alpha: alpha * (1 - motion) });
    });
    return out;
  }
  // compile every shader and upload every texture ahead of time, so nothing compiles the first time a scene
  // appears (on Windows each compile goes through Direct3D and can take 50-200 ms): hidden objects are made
  // visible just for the traversal, then restored; compileAsync uses parallel compilation where available
  function warm() {
    const hiddenObjs = [];
    scene.traverse(o => { if (!o.visible) { hiddenObjs.push(o); o.visible = true; } });
    const textures = new Set();
    scene.traverse(o => {
      const ms = o.material ? [].concat(o.material) : [];
      ms.forEach(m => {
        ['map', 'alphaMap', 'envMap'].forEach(k => { if (m[k]) textures.add(m[k]); });
        if (m.uniforms) Object.values(m.uniforms).forEach(u => { if (u && u.value && u.value.isTexture) textures.add(u.value); });
      });
    });
    if (studio.userData.cover) Object.values(studio.userData.cover.covers).forEach(t => textures.add(t));
    // compile for the target the scene really renders into (the effect pipeline's buffer), so the variants match
    let done;
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(composer.readBuffer);
    try { done = renderer.compileAsync ? renderer.compileAsync(scene, camera) : (renderer.compile(scene, camera), Promise.resolve()); } catch (e) { done = Promise.resolve(); }
    renderer.setRenderTarget(prevTarget);
    hiddenObjs.forEach(o => { o.visible = false; });
    textures.forEach(t => { try { renderer.initTexture(t); } catch (e) {} });
    return done;
  }
  // the page shows the reel once this settles: lighting in place, every shader compiled in parallel, so the first
  // frames never wait on the GPU driver
  const ready = envReady.then(() => warm()).catch(() => {}).then(() => { governFrom = performance.now() + 2000; });
  return {
    ready,
    setStop(f) { stop = f; },
    setOffset(x, y) { offX = x; offY = y; },
    // instant: the clay leaves at once (the photo arrives under the shutter's flash)
    setPhoto(on, instant) { if (photoOn !== !!on) { photoOn = !!on; anim = true; if (instant && on) { keepK = 0; partK = 0; } } },
    // scroll progress through the illustration's own stretch, 0 to 1; it pushes the timeline forward
    setScrub(f) { if (Math.abs(scrubT - f) > 1e-4) { scrubT = f; anim = true; } },
    // the illustration's timeline in seconds (the shutter fires at shotAt), or -1 while it is not running
    get illT() { const m = forms.illModel.meta; return (m.wNow || 0) > 0.5 && m.T !== undefined ? m.T : -1; },
    shotAt: 6.2,
    // the photo as points (built from the loaded image), and how far it has dissolved: 0 whole, 1 gone
    photoPoints(img) { try { return photoPoints(img); } catch (e) { return null; } },
    photoDissolve(p) { const v = p > 0.001 && p < 0.999 && dis.rows > 0; if (dis.pts.visible !== v || Math.abs(dis.mat.uniforms.uP.value - p) > 1e-4) { dis.pts.visible = v; dis.mat.uniforms.uP.value = p; anim = true; } },
    // where the illustration photo goes on the canvas, in CSS pixels: the Blender render covers this camera's view at
    // 16:10, centred on the camera axis, so its centre is the projected look-at point and its height the canvas height
    // times the zoom
    photoRect() { const v = camCenter.clone().project(camera), h = H * camera.zoom; return { cx: (v.x + 1) / 2 * W, cy: (1 - v.y) / 2 * H, w: h * 1.6, h }; },
    setFit(w, h) { fitW = w; fitH = h; },
    // drag in the demo viewport, in radians; reset eases back to the set view
    // the batch viewport's zoom buttons: a step in or out, held until the next layout
    zoom(step) { demoZoom = step ? clamp(demoZoom * (step > 0 ? 1.25 : 0.8), 0.8, 2.5) : 1; anim = true; return demoZoom; },
    orbit(dy, dx, reset) { if (reset) { orbYTo = orbXTo = 0; } else { orbYTo = clamp(orbYTo + dy, -1.3, 1.3); orbXTo = Math.min(0.55, Math.max(-0.35, orbXTo + dx)); } anim = true; },
    setDefocus(px) { defocus = px; },
    // colours for the image mosaics: one array of sRGB triples (0-1) per tile, row by row from the top left
    tileGrid() { const m = forms.vizGrid.meta; return { cols: m.mc, rows: m.mr, aspect: 3 / 2.1 }; },
    setTileColors(list) {
      const F = forms.vizGrid, { tiles, mc, mr } = F.meta, c = new THREE.Color();
      if (!F.rgb) { F.rgb = new Float32Array(N * 3); for (let i = 0; i < N; i++) pal[F.col[i]].toArray(F.rgb, i * 3); }
      list.forEach((arr, k) => {
        if (!arr || !tiles[k]) return;
        for (let p = 0; p < mc * mr; p++) { c.setRGB(arr[p * 3], arr[p * 3 + 1], arr[p * 3 + 2], THREE.SRGBColorSpace); c.toArray(F.rgb, (tiles[k].start + p) * 3); }
      });
    },
    pointer(x, y, on) { ptr = on ? { x, y } : null; },
    setClear(box) { clearBox = box; },
    override(name) { forced = name; },
    addFormation,
    act(name, action, value) { if (CTRL[name]) CTRL[name].act(action, value); },
    refresh(name) { if (CTRL[name] && CTRL[name].refresh) CTRL[name].refresh(); },
    onInfo(fn) { infoCb = fn; },
    labels,
    get motion() { return motion; },
    // a scene animation ran on the last frame (the illustration timeline, a demo run): the page keeps full frame rate
    get animating() { return animating; },
    // GPU ms per drawn frame, where the browser can measure it: fn(ms, { stop, defocus, lowRes, calls, ... })
    onGpu(fn) { gpuCb = fn; },
    get pixelRatio() { return renderer.getPixelRatio(); },
    get three() { return { renderer, scene, camera, key, holder, studio }; },   // for tests and the shot export
    // the frozen illustration shot as data for the offline render: camera, the molecule in holder space, and the
    // studio group (exported separately as glTF); the cover backdrops as images
    shot() {
      const F = forms.illModel, cv = studio.userData.cover;
      // the export takes the cover plane with its texture, as it always had it, even though the page does not draw it
      if (cv) { cv.mat.map = cv.coverOf(document.documentElement.dataset.theme === 'dark'); cv.mat.needsUpdate = true; cv.mat.visible = true; }
      holder.updateMatrixWorld(); camera.updateMatrixWorld();
      return {
        camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), fovY: 30, near: camera.near, far: camera.far, zoom: camera.zoom, lookAt: camCenter.toArray(), dist: camDist },
        holder: holder.matrixWorld.toArray(),
        // r is the full radius; now is the radius at the shutter (an atom still forming is smaller), grow its progress
        atoms: F.meta.local.map((p, i) => ({ el: F.meta.base[i], p: [F.pos[i * 3], F.pos[i * 3 + 1], F.pos[i * 3 + 2]].map(x => +x.toFixed(4)), r: +rAt(F.meta.base[i]).toFixed(4), now: +F.size[i].toFixed(4), grow: +(studio.userData.condense ? studio.userData.condense.g[i] : 1).toFixed(3) })),
        // the steam particles at the shutter, in holder space: position, opacity and size (scene units)
        steam: (() => {
          const st = studio.userData.steamObj; if (!st) return [];
          st.updateMatrixWorld(true); const inv = holder.matrixWorld.clone().invert(), m = inv.multiply(st.matrixWorld), v = new THREE.Vector3(), sc = new THREE.Vector3();
          st.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
          const pa = st.geometry.attributes.position.array, al = st.geometry.attributes.aAlpha.array, sz = st.geometry.attributes.aSize.array, out = [];
          for (let i = 0; i < al.length; i++) { if (al[i] < 0.02) continue; v.fromArray(pa, i * 3).applyMatrix4(m); out.push([+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4), +al[i].toFixed(3), +(sz[i] * sc.x).toFixed(4)]); }
          return out;
        })(),
        bonds: (F.meta.bonds || []).map(b => [b[0], b[1], +(b[2] || BOND_R * ANG).toFixed(4)]), ang: ANG,
        covers: studio.userData.cover ? { dark: studio.userData.cover.coverOf(true).image.toDataURL('image/png'), light: studio.userData.cover.coverOf(false).image.toDataURL('image/png') } : null,
        studio, holderObj: holder
      };
    },
    get programs() { return renderer.info.programs ? renderer.info.programs.length : -1; },
    software,
    // nothing is moving and no animation is running: the last frame can stay on screen
    get idle() { const d = dirty; dirty = false; return settled && !d; },
    render
  };
}
