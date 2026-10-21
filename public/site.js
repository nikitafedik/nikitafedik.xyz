// Shared by the inner pages: applies the saved accent, typeface and theme from index.html's
// 'nf-style' store and mounts the same Jablonski theme switch.
import { mountSky } from './sky.js';
const ACCENTS = [
  { c: '#FF8A3D', l: '#B4410A', d: '#FFA56A' }, { c: '#2EC4D6', l: '#0B6F7C', d: '#6FE3EF' },
  { c: '#2FBF71', l: '#137A43', d: '#6EE0A0' }, { c: '#5B7BFF', l: '#2D46C4', d: '#9DB0FF' },
  { c: '#F05A7E', l: '#B0244A', d: '#FF92AB' }
];
const FONTS = [['Roboto', 'Roboto Mono'], ['Familjen Grotesk'], ['Bricolage Grotesque'], ['Schibsted Grotesk'], ['Instrument Sans']];
const root = document.documentElement;
const load = () => { try { return JSON.parse(localStorage.getItem('nf-style') || '{}'); } catch (e) { return {}; } };
const save = v => { try { localStorage.setItem('nf-style', JSON.stringify({ ...load(), ...v })); } catch (e) {} };
const saved = load();
const a = ACCENTS[saved.accent ?? 0] || ACCENTS[0];
root.style.setProperty('--accent', a.c); root.style.setProperty('--link-l', a.l); root.style.setProperty('--link-d', a.d);
const f = FONTS[saved.font ?? 0] || FONTS[0];
if (f[0] !== 'Roboto') {
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + f[0].replace(/\s+/g, '+') + ':wght@400;500;600;700&display=swap';
  document.head.append(l);
  root.style.setProperty('--display', `'${f[0]}', 'Segoe UI', system-ui, sans-serif`);
}
const tags = ['[by trial and render]', '[self-taught, GPU-assisted]', '[unlicensed]', '[in beta]', '[no formal training, lots of renders]'];
const tagEm = document.querySelector('#tagline em');
if (tagEm) tagEm.textContent = tags[saved.tag ?? 0] || tags[0];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let dark = saved.theme ? saved.theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
function applyTheme(toDark, origin) {
  dark = toDark;
  save({ theme: dark ? 'dark' : 'light' });
  const set = () => { root.dataset.theme = dark ? 'dark' : 'light'; };
  if (reduceMotion || !document.startViewTransition) { set(); return; }
  const vt = document.startViewTransition(set);
  vt.ready.then(() => {
    const r = Math.hypot(Math.max(origin.x, innerWidth - origin.x), Math.max(origin.y, innerHeight - origin.y));
    root.animate({ clipPath: [`circle(0px at ${origin.x}px ${origin.y}px)`, `circle(${r}px at ${origin.x}px ${origin.y}px)`] },
      { duration: 750, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' });
  });
}
root.dataset.theme = dark ? 'dark' : 'light';
mountSky(document.getElementById('skySlot'), { dark, onChange: (d, o) => applyTheme(d, o) });
