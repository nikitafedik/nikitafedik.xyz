// The skills reel: every skill button lands on its own scene, and the demo runs from picking to results.
import { test, expect } from '@playwright/test';
import { goToSkill, watchErrors } from './helpers';

const SKILLS = ['Chemistry and materials [+AI]', 'Scientific illustration and 3D design', 'Scientific demo design', 'Tutorials and workshops'];

test('each skill button lands on its scene', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('');
  for (const [i, name] of SKILLS.entries()) {
    await goToSkill(page, i + 1);
    await expect(page.locator('.reel-item[aria-current="step"] button')).toHaveText(name);
  }
  expect(errors).toEqual([]);
});

test('the demo runs from picking to results', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('?perf');
  await page.waitForFunction(() => (window as any).__reel, null, { timeout: 60_000 });
  await goToSkill(page, 3);
  await page.getByRole('button', { name: 'Simulate', exact: true }).click();
  await page.getByRole('button', { name: /on the GPU/ }).click();
  await expect(page.locator('#demoApp')).toHaveAttribute('data-screen', 'results', { timeout: 90_000 });
  await expect(page.locator('.hm-c.chem, .hm-c.phys, .hm-c.gone').first()).toBeVisible();
  expect(errors).toEqual([]);
});
