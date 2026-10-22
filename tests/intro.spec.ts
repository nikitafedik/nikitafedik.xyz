// The home intro, sampled every 20 px of scroll, down and back up. Desktop: the text holds while the lines sharpen,
// then scrolls away. Phones: the text moves with the finger from the start. Both: the speed never jumps, "What I do
// best" lands sharp in its place, never covers a visible line, and the first paint already has everything in place.
import { test, expect, type Page } from '@playwright/test';
import { scrollToY, isPhone, watchErrors } from './helpers';

type Sample = { y: number, list: number, head: number, hop: number, filter: string, lines: [number, number, number][] };

async function sample(page: Page) {
  const info = await page.evaluate(() => {
    const i = document.querySelector('.intro') as HTMLElement, pin = document.querySelector('.intro-pin') as HTMLElement;
    return { start: i.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(pin).top) || 0), len: i.offsetHeight - pin.clientHeight, h: innerHeight };
  });
  const end = Math.round(info.start + info.len + info.h * 0.4);
  const read = () => page.evaluate(() => {
    const L = document.getElementById('introList')!, hd = document.getElementById('reelTitle')!, pin = document.querySelector('.intro-pin') as HTMLElement;
    const pt = pin.getBoundingClientRect().top, mb = parseFloat(getComputedStyle(pin).getPropertyValue('--mb')) || 0.86 * pin.clientHeight;
    // a line's visible part ends where the intro's bottom fade has made it transparent
    const lines = [...L.children].map(e => { const r = e.getBoundingClientRect(); return [r.top, Math.min(r.bottom, pt + mb + 30), +getComputedStyle(e).opacity]; });
    return { y: scrollY, list: L.getBoundingClientRect().top, head: hd.getBoundingClientRect().top, hop: +getComputedStyle(hd).opacity, filter: getComputedStyle(hd).filter, lines };
  }) as Promise<Sample>;
  const down: Sample[] = [], up: Sample[] = [];
  for (let y = 0; y <= end; y += 20) { await scrollToY(page, y); down.push(await read()); }
  for (let y = end - (end % 20); y >= 0; y -= 20) { await scrollToY(page, y); up.push(await read()); }
  return { info, down, up: up.reverse() };
}

const speeds = (s: Sample[]) => s.slice(1).map((x, i) => (s[i].list - x.list) / (x.y - s[i].y || 1));

test('the intro scrolls smoothly and hands over to "What I do best"', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('');
  await page.waitForTimeout(1500);
  const { info, down, up } = await sample(page);
  for (const [dir, s] of [['down', down], ['up', up]] as const) {
    const v = speeds(s);
    const jump = Math.max(...v.slice(2).map((x, i) => Math.abs(x - v[i + 1])));
    expect(jump, `${dir}: largest change in text speed between 20 px steps`).toBeLessThanOrEqual(0.25);
    // the heading never sits on a visible line above it
    for (const x of s) {
      if (x.hop < 0.02 || x.head > info.h - 10) continue;
      const above = x.lines.filter(l => l[2] > 0.05 && l[0] < x.head + 5).map(l => l[1]);
      if (above.length) expect(x.head - Math.max(...above), `${dir} at ${x.y}: gap between the heading and the text above it`).toBeGreaterThanOrEqual(-2);
    }
  }
  // it lands: still over the last steps, fully opaque and sharp
  const tail = down.slice(-6);
  expect(Math.max(...tail.map(x => x.head)) - Math.min(...tail.map(x => x.head))).toBeLessThan(1);
  expect(tail.at(-1)!.hop).toBe(1);
  expect(tail.at(-1)!.filter).toBe('none');
  // both directions show the same thing at the same scroll position
  for (let i = 0; i < Math.min(down.length, up.length); i++) if (down[i].y === up[i].y) expect(Math.abs(down[i].list - up[i].list)).toBeLessThan(1);
  if (isPhone(page)) {
    // phones: the text moves with the finger, at the scroll's own speed
    const v = speeds(down.filter(x => x.y <= info.start + info.len));
    for (const x of v.slice(2)) expect(x).toBeCloseTo(1, 1);
  } else {
    // desktop: the text holds still while the first lines sharpen
    const early = down.filter(x => x.y <= 400);
    expect(Math.max(...early.map(x => x.list)) - Math.min(...early.map(x => x.list))).toBeLessThan(1);
  }
  expect(errors).toEqual([]);
});

test('the first paint already has the intro in place', async ({ page }) => {
  // no scripts at all: what the page shows before they run
  await page.route(/\.m?js(\?.*)?$/, r => r.abort());
  await page.goto('');
  const s = await page.evaluate(() => ({
    list: document.getElementById('introList')!.getBoundingClientRect().top - document.querySelector('.intro-pin')!.getBoundingClientRect().top,
    head: getComputedStyle(document.getElementById('reelTitle')!).visibility,
    skills: getComputedStyle(document.querySelector('.reel-list')!).visibility,
    blurred: getComputedStyle(document.querySelectorAll('#introList > *')[3]).filter,
  }));
  if (!isPhone(page)) expect(s.list).toBeCloseTo(48, 0);
  expect(s.list).toBeGreaterThan(20);
  expect(s.head).toBe('hidden');
  expect(s.skills).toBe('hidden');
  expect(s.blurred).not.toBe('none');
});
