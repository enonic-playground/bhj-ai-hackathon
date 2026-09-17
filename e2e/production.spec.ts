import { expect, test, type Page } from '@playwright/test';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { SEED_WORDS } from '../src/game/words.js';
import { chaseUntilCaught, snapshot } from './support.js';

/**
 * These journeys run against the ordinary production build (`npm run build`),
 * served on its own port by `playwright.config.ts`. Everything else in `e2e/`
 * runs against the test-only fixture build. Nothing here passes a start-up
 * parameter except the checks that prove the parameters do nothing.
 */

const FIXTURE_PARAMETERS = ['testBall', 'testWord', 'testSeed'] as const;

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

test('production smoke: an unparameterized round chases, catches and guesses', async ({ page }) => {
  const maze = createLevelOneMaze();
  await page.goto('/');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  const started = await snapshot(page);
  expect(started.ball).not.toBeNull(); // The real spawn rule placed a ball.
  expect(started.word.mask.every((letter) => letter === null)).toBe(true);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).score, { timeout: 5_000 }).toBeGreaterThan(0);

  await chaseUntilCaught(page, maze);
  await expect(page.locator('#guess-panel')).toBeVisible();
  const caught = await snapshot(page);
  expect(caught.ball).toBeNull();

  // The answer is unknown to this journey, so either outcome of one letter is
  // acceptable; what matters is that a real guess is applied exactly once.
  await page.locator('[data-letter="E"]').click();
  const guessed = await snapshot(page);
  if (guessed.status === 'guess') {
    expect(guessed.word.revealedLetters).toContain('E');
    expect(guessed.score).toBeGreaterThan(caught.score);
  } else {
    expect(guessed.status).toBe('resuming');
    expect(guessed.word.wrongLetters).toEqual(['E']);
    expect(guessed.score).toBe(caught.score);
  }
  await expect(page.locator('[data-letter="E"]')).toBeDisabled();
});

test('production output carries no fixture controls', async ({ page, request }) => {
  await page.goto('/');
  const scripts = await page.locator('script[src]').evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLScriptElement).getAttribute('src') ?? ''),
  );
  expect(scripts.length).toBeGreaterThan(0);

  for (const src of scripts) {
    const response = await request.get(src.replace(/^\.\//, ''));
    expect(response.ok()).toBe(true);
    const body = await response.text();
    for (const parameter of FIXTURE_PARAMETERS) {
      expect(body).not.toContain(parameter);
    }
  }
});

test('testBall=off cannot disable the ball in production', async ({ page }) => {
  await page.goto('/?testBall=off');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  await expect
    .poll(async () => (await snapshot(page)).ball, { timeout: 5_000 })
    .not.toBeNull();

  // And the round still reaches guessing, which the fixture URL would prevent.
  await chaseUntilCaught(page, createLevelOneMaze());
  expect((await snapshot(page)).status).toBe('guess');
});

test('testWord cannot pin the word in production', async ({ page }) => {
  const pinned = SEED_WORDS[0];
  if (!pinned) throw new Error('the seed word list is empty');

  // Word selection is random here, so the pinned entry may legitimately come up.
  // Eight independent rounds all matching it would be a 1-in-8^8 coincidence.
  const categories: string[] = [];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.goto(`/?testWord=0&testSeed=7`);
    await page.getByRole('button', { name: 'Start game' }).click();
    await expect(page.locator('#hud-mode')).toHaveText('Chase');
    const state = await snapshot(page);
    categories.push(state.word.category);
    if (state.word.category !== pinned.category) break;
  }

  expect(categories.some((category) => category !== pinned.category)).toBe(true);
});
