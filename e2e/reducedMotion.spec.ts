import { expect, test, type Page } from '@playwright/test';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { CALM_FIXTURE, chaseUntilCaught } from './support.js';

/**
 * AC3: `prefers-reduced-motion` is respected on initial load and on a
 * runtime change, and only decorative canvas oscillation is affected —
 * simulation speed, timers and scoring are not. `tests/motion.test.ts`
 * covers the presentation arithmetic directly; these journeys read the
 * colour the renderer actually drew, and drive a real round.
 */

declare global {
  interface Window {
    __sampleBallFill?: () => { r: number; g: number; b: number; a: number } | null;
  }
}

async function installSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__sampleBallFill = () => {
      const canvas = document.querySelector<HTMLCanvasElement>('#maze-canvas');
      const state = window.__hacman?.getSnapshot();
      if (!canvas || !state?.ball) return null;
      const context = canvas.getContext('2d');
      if (!context) return null;
      const ratio = canvas.width / Number.parseFloat(canvas.style.width || '0');
      const tile = canvas.width / 21 / ratio;
      const x = Math.round((state.ball.x + 0.5) * tile * ratio);
      const y = Math.round((state.ball.y + 0.5) * tile * ratio);
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
      const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
      return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: a ?? 0 };
    };
  });
}

interface Pixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

async function sampleFill(page: Page): Promise<Pixel> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pixel = await page.evaluate(() => window.__sampleBallFill?.() ?? null);
    if (pixel && pixel.a === 255) return pixel;
    await page.waitForTimeout(50);
  }
  throw new Error('the ball could not be sampled');
}

test('the ball fill holds a single stable colour when the system prefers reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installSampler(page);
  await page.goto(CALM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  const first = await sampleFill(page);
  await page.waitForTimeout(2_500); // Well over one full D015 cycle (2,000ms).
  const later = await sampleFill(page);

  expect(later).toEqual(first);
});

test('a runtime preference change takes effect without a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await installSampler(page);
  await page.goto(CALM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  // Normal motion: the fill actually changes over time.
  const beforeToggle = await sampleFill(page);
  await page.waitForTimeout(700);
  const stillNormal = await sampleFill(page);
  expect(stillNormal).not.toEqual(beforeToggle);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(150); // Lets the change event and one frame land.
  const justSwitched = await sampleFill(page);
  await page.waitForTimeout(2_200);
  const afterSwitch = await sampleFill(page);
  expect(afterSwitch).toEqual(justSwitched);
});

test('toggling the preference while guessing is frozen never advances the maze', async ({ page }) => {
  const maze = createLevelOneMaze();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(CALM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  await chaseUntilCaught(page, maze);
  await expect(page.locator('#guess-panel')).toBeVisible();

  const before = await page.evaluate(() => window.__hacman?.getSnapshot());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__hacman?.getSnapshot());

  expect(after?.status).toBe('guess');
  expect(after?.score).toBe(before?.score);
  expect(after?.word.revealedLetters).toEqual(before?.word.revealedLetters);
});
