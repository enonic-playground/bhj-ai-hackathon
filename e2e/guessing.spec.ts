import { expect, test, type Page } from '@playwright/test';
import { ALPHABET } from '../src/game/words.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { CALM_FIXTURE, chaseUntilCaught, snapshot } from './support.js';

const MAZE_COLUMNS = 21;
const MAZE_ROWS = 23;
const MIN_TARGET = 44;

async function box(page: Page, selector: string) {
  const found = await page.locator(selector).boundingBox();
  if (!found) throw new Error(`No layout box for ${selector}`);
  return found;
}

test.beforeEach(async ({ page }) => {
  await page.goto(CALM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
});

test('the guessing panel fits the viewport with usable letter targets', async ({ page }) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');

  await chaseUntilCaught(page, createLevelOneMaze());
  await expect(page.locator('#guess-panel')).toBeVisible();

  // Score, mode, level, category and word progress all stay readable.
  await expect(page.locator('#hud-score')).toHaveText(/\d+/);
  await expect(page.locator('#hud-level')).toHaveText('1/5');
  await expect(page.locator('#hud-mode')).toHaveText('Guessing');
  await expect(page.locator('#word-category')).toHaveText('Fruit');
  await expect(page.locator('#word-mask')).toHaveText('_ _ _ _ _');

  // Every letter is present, large enough to hit, and inside the viewport, so
  // no device keyboard and no page scrolling are needed.
  for (const letter of ALPHABET) {
    const key = await box(page, `[data-letter="${letter}"]`);
    expect(key.width).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(key.height).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(key.y).toBeGreaterThanOrEqual(0);
    expect(key.y + key.height).toBeLessThanOrEqual(viewport.height + 1);
    expect(key.x + key.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});

test('guessed letters are marked by symbol as well as colour', async ({ page }) => {
  await chaseUntilCaught(page, createLevelOneMaze());

  await page.locator('[data-letter="A"]').click();
  await expect(page.locator('[data-letter="A"]')).toHaveAttribute('data-state', 'hit');
  await expect(page.locator('[data-letter="A"] .letter__mark')).toHaveText('✓');

  await page.locator('[data-letter="Z"]').click();
  await expect(page.locator('[data-letter="Z"]')).toHaveAttribute('data-state', 'miss');
  await expect(page.locator('[data-letter="Z"] .letter__mark')).toHaveText('✗');
  await expect(page.locator('[data-letter="Z"]')).toHaveAttribute(
    'aria-label',
    'Z, not in the word',
  );
  await expect(page.locator('#word-misses')).toHaveText('Misses: Z');
});

test('keyboard focus stays on a usable control through a round', async ({ page }) => {
  await chaseUntilCaught(page, createLevelOneMaze());
  await expect(page.locator('#guess-heading')).toBeFocused();

  // Operating a letter with the keyboard alone moves focus off the letter it
  // just disabled, onto the next one that can still be guessed.
  await page.locator('[data-letter="P"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-letter="P"]')).toBeDisabled();
  await expect(page.locator('[data-letter="Q"]')).toBeFocused();

  // A miss hands focus back to the play region for the countdown and chase.
  await page.locator('[data-letter="Z"]').click();
  await expect(page.locator('#stage')).toBeFocused();
  await expect(page.locator('#guess-panel')).toBeHidden();
});

test('a hidden panel keeps no controls in the tab order', async ({ page }) => {
  const focusable = async (): Promise<string[]> =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>('#panel button')]
        .filter((element) => !element.disabled && element.offsetParent !== null)
        .map((element) => element.getAttribute('data-direction') ?? element.getAttribute('data-letter') ?? ''),
    );

  // Chasing: the pad is live and no letter can be reached.
  expect(await focusable()).toEqual(['up', 'left', 'right', 'down']);

  await chaseUntilCaught(page, createLevelOneMaze());
  // Guessing: the letters are live and the pad is gone.
  expect(await focusable()).toEqual([...ALPHABET]);
});

test('a short viewport still fits the maze, the pad and the letters', async ({ page }, testInfo) => {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');

  const tall = { width: viewport.width, height: viewport.height + 240 };
  await page.setViewportSize(tall);
  await chaseUntilCaught(page, createLevelOneMaze());
  await expect(page.locator('#guess-panel')).toBeVisible();

  // The M1 resize path, now with the guessing panel open on top of it.
  await page.setViewportSize(viewport);
  await expect
    .poll(async () => {
      const canvas = await page.locator('#maze-canvas').boundingBox();
      return canvas ? canvas.y + canvas.height : Number.POSITIVE_INFINITY;
    }, { timeout: 5_000 })
    .toBeLessThanOrEqual(viewport.height + 1);

  const canvas = await box(page, '#maze-canvas');
  expect(canvas.width / MAZE_COLUMNS).toBeCloseTo(canvas.height / MAZE_ROWS, 5);
  for (const letter of ['A', 'M', 'Z']) {
    const key = await box(page, `[data-letter="${letter}"]`);
    expect(key.height).toBeGreaterThanOrEqual(MIN_TARGET);
    expect(key.y + key.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  await page.screenshot({ path: `docs/evidence/m3/${testInfo.project.name}-guess-short.png` });

  // Back to the chase, the maze and pad still share the shorter viewport.
  await page.locator('[data-letter="Z"]').click();
  await expect.poll(async () => (await snapshot(page)).status, { timeout: 5_000 }).toBe('chase');
  const pad = await box(page, '#pad');
  expect(pad.y + pad.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(pad.height).toBeGreaterThanOrEqual(MIN_TARGET);
});
