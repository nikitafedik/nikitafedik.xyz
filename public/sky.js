// Theme switch drawn as a tiny Jablonski diagram (dark theme = excited state, light theme = ground state). Two electronic levels,
// the ground state S0 and the first excited singlet S1, each with two thinner
// vibrational sublevels above it. A dot marks the state of the molecule.
//
//   night: the molecule is excited, the electron (a dot drawn as a tiny spin arrow) rests on the lowest level of S1
//   to day (fluorescence): the dot drops from the bottom of S1 to an upper
//     vibrational level of S0 along a straight arrow, a photon leaves to the
//     right, then the dot relaxes to the bottom of S0 along a wavy line
//   to night (absorption): a photon arrives from the right, the dot jumps from
//     the bottom of S0 to an upper vibrational level of S1 along a straight
//     arrow, then relaxes to the bottom of S1 along a wavy line (Kasha's rule)
//
// The absorption arrow is longer than the emission arrow, so the emitted photon
// carries less energy (Stokes shift). It is drawn with a longer wavelength in
// the warm accent colour; the absorbed photon is shorter and blue.
// Radiative steps are straight arrows, non-radiative steps are wavy.
//
//   const sky = mountSky(container, { dark, onChange })
//   onChange(isDark, { x, y })   user picked the other state; x, y are the
//                                viewport coordinates where the photon meets
//                                the transition arrow
//   sky.set(isDark)              update from outside, no onChange

const W = 48, H = 48;                     // svg size in CSS px, 1 unit = 1 px; photons
                                          // run past the right edge, over the label
const X = 30;                             // column of the transitions
// each electronic level carries a short stack of vibrational levels just above it,
// spaced a little closer going up (anharmonic); the gap between S0 and S1 stays clear
const S1 = 15, S1V = [12, 9.4, 7.2];      // S1 and its vibrational levels
const S0 = 44, S0V = [41, 38.4, 36.2];    // S0 and its vibrational levels
const L0 = 16, L1 = 44;                   // level line ends
const PY = 23.5;                          // height where photons meet the arrows
const SPAN = 800;                         // keyframe times below are written on a 0-800 scale
const D = 1900;                           // real length of one transition, ms: slow enough to follow
const EASE = 'cubic-bezier(.4,0,.2,1)';

const f = n => +n.toFixed(2);
// a photon: a horizontal sine squiggle from x0 over len (a whole number of wavelengths), a short straight lead and
// a filled arrowhead at the far end, so its direction reads at a glance; dir +1 points right, -1 points left
function photon(x0, y, len, lam, amp, dir, cls) {
  let d = '';
  for (let t = 0; t <= len + 1e-6; t += 0.5) {
    d += (t ? 'L' : 'M') + f(x0 + dir * t) + ' ' + f(y - amp * Math.sin(2 * Math.PI * t / lam)) + ' ';
  }
  const e = x0 + dir * (len + 2.6), tip = e + dir * 3.4;
  d += `L${f(e)} ${y}`;
  return `<g class="pk-ph ${cls}"><path d="${d}"/><path class="pk-ph-h" d="M${f(tip)} ${y}L${f(e)} ${f(y - 2.5)}L${f(e)} ${f(y + 2.5)}Z"/></g>`;
}
// a vertical wavy line from y0 down to y1
function relax(y0, y1, lam = 2.7, amp = 1.5) {
  let d = '';
  for (let t = 0; t <= y1 - y0 + 1e-6; t += 0.4) {
    d += (t ? 'L' : 'M') + f(X + amp * Math.sin(2 * Math.PI * t / lam)) + ' ' + f(y0 + t) + ' ';
  }
  return d;
}
const level = (y, main) => `<line class="${main ? 'pk-lv' : 'pk-vib'}" x1="${main ? L0 : L0 + 3}" x2="${main ? L1 : L1 - 3}" y1="${y}" y2="${y}"/>`;

const SVG = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">
  <text x="3" y="${S1 + 2.6}">S1</text><text x="3" y="${S0 + 2.6}">S0</text>
  ${S1V.map(y => level(y)).join('')}${level(S1, true)}
  ${S0V.map(y => level(y)).join('')}${level(S0, true)}
  <path class="pk-tr pk-abs" pathLength="1" d="M${X} ${S0}V${S1V[1]}"/>
  <path class="pk-head pk-abs-h" d="M${X - 2.2} ${S1V[1] + 2.6}L${X} ${S1V[1]}L${X + 2.2} ${S1V[1] + 2.6}"/>
  <path class="pk-tr pk-em" pathLength="1" d="M${X} ${S1}V${S0V[1]}"/>
  <path class="pk-head pk-em-h" d="M${X - 2.2} ${S0V[1] - 2.6}L${X} ${S0V[1]}L${X + 2.2} ${S0V[1] - 2.6}"/>
  <path class="pk-tr pk-nr pk-nr1" pathLength="1" d="${relax(S1V[1], S1)}"/>
  <path class="pk-tr pk-nr pk-nr0" pathLength="1" d="${relax(S0V[1], S0)}"/>
  ${photon(X + 25, PY, 14.4, 3.6, 1.8, -1, 'pk-ph-in')}
  ${photon(X + 4, PY, 13, 6.5, 2.1, 1, 'pk-ph-out')}
  <g class="pk-dot"><line x1="${X}" y1="2.6" x2="${X}" y2="-2.2"/><path d="M${X} -4.4L${X - 2} -1.4L${X + 2} -1.4Z"/></g>
</svg>`;

const STYLE = `
.pk-sky { --pk-blue: color-mix(in srgb, #4C7DF0 72%, var(--ink, #131722));
  display: inline-flex; align-items: center; gap: 6px; min-height: 56px; padding: 4px 10px 4px 4px; margin: 0;
  border: 0; border-radius: 10px; background: none; color: var(--faint, #545C70); font: inherit; cursor: pointer;
  user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.pk-sky:focus { outline: none; }
.pk-sky:focus-visible { outline: 2px solid var(--link, var(--accent, #FF8A3D)); outline-offset: 2px; border-radius: 10px; }
.pk-sky svg { display: block; flex: none; overflow: visible; }
.pk-sky text { font-family: var(--secondary, var(--mono, 'Roboto Mono', ui-monospace, monospace)); font-size: 7.5px; fill: var(--faint, #545C70); }
.pk-sky .pk-lv { stroke: var(--ink, #131722); stroke-width: 1.3; stroke-linecap: round; }
.pk-sky .pk-vib { stroke: var(--faint, #545C70); stroke-width: .6; stroke-linecap: round; opacity: .55; }
.pk-sky .pk-tr, .pk-sky .pk-head, .pk-sky .pk-ph { fill: none; stroke-width: 1.2; stroke-linecap: round; stroke-linejoin: round; opacity: 0; }
.pk-sky .pk-tr { stroke-dasharray: 1; stroke-dashoffset: 1; }
.pk-sky .pk-abs, .pk-sky .pk-abs-h, .pk-sky .pk-ph-in path { stroke: var(--pk-blue); }
.pk-sky .pk-em, .pk-sky .pk-em-h, .pk-sky .pk-ph-out path { stroke: var(--accent, #FF8A3D); }
.pk-sky .pk-ph path { fill: none; }
.pk-sky .pk-nr { stroke: var(--faint, #545C70); stroke-width: .9; }
/* the electron, drawn as a tiny spin arrow */
.pk-sky .pk-dot line { stroke: var(--ink, #131722); stroke-width: 1.3; stroke-linecap: round; }
.pk-sky .pk-dot path { fill: var(--ink, #131722); }
.pk-sky .pk-ph-h { stroke: none; }
.pk-sky .pk-ph-in .pk-ph-h { fill: var(--pk-blue); }
.pk-sky .pk-ph-out .pk-ph-h { fill: var(--accent, #FF8A3D); }
.pk-sky .pk-label { min-width: 7.5ch; font-family: var(--secondary, var(--mono, 'Roboto Mono', ui-monospace, monospace));
  font-size: 12px; font-weight: 400; line-height: 1; letter-spacing: 0.02em; text-align: left; transition: color .2s; }
.pk-sky:hover .pk-label { color: var(--ink, #131722); }
`;
function injectStyle() {
  if (document.getElementById('pk-sky-style')) return;
  const s = document.createElement('style');
  s.id = 'pk-sky-style';
  s.textContent = STYLE;
  document.head.append(s);
}

// frames: [[time ms, props], ...] over a run of D ms; props use y for the dot,
// x for a photon shift, d for the dash offset of a trace, o for opacity
function play(el, frames) {
  const kf = frames.map(([t, p]) => {
    const k = { offset: t / SPAN, easing: p.ease || EASE };
    if ('y' in p) k.transform = `translate(0px, ${p.y}px)`;
    if ('x' in p) k.transform = `translate(${p.x}px, 0px)`;
    if ('d' in p) k.strokeDashoffset = p.d;
    if ('o' in p) k.opacity = p.o;
    return k;
  });
  return el.animate(kf, { duration: D });
}

export function mountSky(container, { dark = false, onChange = () => {} } = {}) {
  injectStyle();
  const reduceQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  let isDark = !!dark;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pk-sky';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-label', 'Dark theme');
  btn.innerHTML = SVG;
  const svg = btn.querySelector('svg');
  const q = s => svg.querySelector(s);
  const dot = q('.pk-dot');
  const label = document.createElement('span');
  label.className = 'pk-label';
  label.setAttribute('aria-hidden', 'true');
  btn.append(label);

  let running = [];
  function stop() {
    running.forEach(a => a.cancel());
    running = [];
  }
  function sync() {
    btn.setAttribute('aria-checked', String(isDark));
    // the label names the molecule's state; the tooltip says what a click does
    label.textContent = isDark ? 'excited' : 'ground';
    btn.title = isDark ? 'Emit a photon: light theme' : 'Absorb a photon: dark theme';
    dot.style.transform = `translate(0px, ${isDark ? S1 : S0}px)`;
  }
  // where the photon meets the transition arrow
  function origin() {
    const r = svg.getBoundingClientRect();
    return { x: r.left + X * r.width / W, y: r.top + PY * r.height / H };
  }

  // the label steps aside while a photon crosses its place
  const fadeLabel = () => play(label, [[0, { o: 1 }], [60, { o: 0 }], [600, { o: 0 }], [SPAN, { o: 1 }]]);

  function animate(toDark) {
    // start from wherever the dot is now, in case a previous run is cut short
    const m = getComputedStyle(dot).transform.match(/matrix\(([^)]+)\)/);
    const cur = m ? +m[1].split(',')[5] : (toDark ? S0 : S1);
    stop();
    if (toDark) {
      // absorption, then vibrational relaxation within S1
      running = [
        fadeLabel(),
        play(q('.pk-ph-in'), [[0, { o: 0, x: 16, ease: 'linear' }], [60, { o: 1, x: 12, ease: 'linear' }], [200, { o: 1, x: 1, ease: 'linear' }], [250, { o: 0, x: 0 }], [SPAN, { o: 0, x: 0 }]]),
        play(dot, [[0, { y: cur }], [200, { y: S0 }], [420, { y: S1V[1] }], [600, { y: S1 }], [SPAN, { y: S1 }]]),
        play(q('.pk-abs'), [[0, { d: 1, o: 1 }], [200, { d: 1, o: 1 }], [420, { d: 0, o: 1 }], [560, { d: 0, o: 1 }], [SPAN, { d: 0, o: 0 }]]),
        play(q('.pk-abs-h'), [[0, { o: 0 }], [400, { o: 0 }], [440, { o: 1 }], [560, { o: 1 }], [SPAN, { o: 0 }]]),
        play(q('.pk-nr1'), [[0, { d: 1, o: 1 }], [420, { d: 1, o: 1 }], [600, { d: 0, o: 1 }], [640, { d: 0, o: 1 }], [SPAN, { d: 0, o: 0 }]])
      ];
    } else {
      // fluorescence from the bottom of S1, then vibrational relaxation within S0
      running = [
        fadeLabel(),
        play(dot, [[0, { y: cur }], [220, { y: S0V[1] }], [440, { y: S0 }], [SPAN, { y: S0 }]]),
        play(q('.pk-em'), [[0, { d: 1, o: 1 }], [220, { d: 0, o: 1 }], [520, { d: 0, o: 1 }], [SPAN, { d: 0, o: 0 }]]),
        play(q('.pk-em-h'), [[0, { o: 0 }], [200, { o: 0 }], [240, { o: 1 }], [520, { o: 1 }], [SPAN, { o: 0 }]]),
        play(q('.pk-ph-out'), [[0, { o: 0, x: -4, ease: 'linear' }], [80, { o: 0, x: -4, ease: 'linear' }], [160, { o: 1, x: -1, ease: 'linear' }], [440, { o: 1, x: 9, ease: 'linear' }], [560, { o: 0, x: 13 }], [SPAN, { o: 0, x: 13 }]]),
        play(q('.pk-nr0'), [[0, { d: 1, o: 1 }], [220, { d: 1, o: 1 }], [440, { d: 0, o: 1 }], [520, { d: 0, o: 1 }], [SPAN, { d: 0, o: 0 }]])
      ];
    }
  }

  sync();
  container.append(btn);

  // click covers mouse, touch, Enter and Space
  btn.addEventListener('click', () => {
    isDark = !isDark;
    const o = origin();
    if (reduceQ.matches || !dot.animate) { stop(); sync(); }
    else { animate(isDark); sync(); }
    onChange(isDark, o);
  });

  return {
    set(next) {
      next = !!next;
      if (next === isDark) return;
      isDark = next;
      stop();
      sync();
    }
  };
}
