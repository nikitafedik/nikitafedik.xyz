// Cover chips on the publications page. The large covers download once the page has loaded,
// so a click can open one at once: the cover grows out of its chip to fill most of the screen,
// and shrinks back into it on close (a click anywhere or Escape).
const box = document.getElementById('coverBox');
const chips = [...document.querySelectorAll('button.cv-chip')];
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (box && chips.length) {
  const img = box.querySelector('img'), label = box.querySelector('p');
  const preload = () => chips.forEach(c => { const i = new Image(); i.decoding = 'async'; i.src = c.dataset.cover; });
  document.readyState === 'complete' ? preload() : addEventListener('load', preload, { once: true });
  let from = null, closing = false;
  // the transform that puts the open dialog over the chip it came from
  const toChip = () => {
    const a = from.getBoundingClientRect(), b = box.getBoundingClientRect();
    const s = Math.max(0.04, a.height / b.height);
    return `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${s})`;
  };
  chips.forEach(c => c.addEventListener('click', async () => {
    from = c;
    img.src = c.dataset.cover;
    label.textContent = c.dataset.label;
    try { await img.decode(); } catch (e) {}
    // as tall as the screen allows, keeping the cover's proportions
    const ratio = (img.naturalWidth || 3) / (img.naturalHeight || 4);
    img.style.width = Math.round(Math.min(innerWidth - 52, (innerHeight - 92) * ratio)) + 'px';
    box.showModal();
    if (!reduce) box.animate([{ transform: toChip(), opacity: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }));
  const close = () => {
    if (closing || !box.open) return;
    if (reduce || !from) { box.close(); return; }
    closing = true;
    box.classList.add('closing');
    box.animate([{ transform: 'none', opacity: 1 }, { transform: toChip(), opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.4,0,.6,1)' })
      .finished.then(() => { box.close(); box.classList.remove('closing'); closing = false; from.focus({ preventScroll: true }); });
  };
  box.addEventListener('click', close);
  box.addEventListener('cancel', e => { e.preventDefault(); close(); });
}
