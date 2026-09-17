import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { CATEGORY, FIXTURE, WORD, chaseUntilCaught, snapshot } from './support.js';

const consoleErrors = new WeakMap<Page, string[]>();

async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `docs/evidence/m2/${testInfo.project.name}-${name}.png` });
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(FIXTURE);
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

test('the complete round: catch, guess, miss, catch again, solve and replay', async ({
  page,
}, testInfo) => {
  const maze = createLevelOneMaze();
  const letter = (character: string) => page.locator(`[data-letter="${character}"]`);

  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  await expect(page.locator('#word-category')).toHaveText(CATEGORY);
  await expect(page.locator('#word-mask')).toHaveText('_ _ _ _ _');
  expect((await snapshot(page)).ball).not.toBeNull();
  await shoot(page, testInfo, 'chase');

  // ---- First catch -------------------------------------------------------
  await chaseUntilCaught(page, maze);
  await expect(page.locator('#hud-mode')).toHaveText('Guessing');
  await expect(page.locator('#guess-panel')).toBeVisible();
  await expect(page.locator('#guess-heading')).toBeFocused();
  await expect(page.locator('#pad')).toBeHidden();
  const caught = await snapshot(page);
  expect(caught.ball).toBeNull();
  await shoot(page, testInfo, 'guess');

  // The frozen maze does not move while the panel is open.
  await page.waitForTimeout(400);
  expect((await snapshot(page)).player).toEqual(caught.player);

  // ---- A correct letter reveals every occurrence -------------------------
  await letter('P').click();
  await expect(page.locator('#word-mask')).toHaveText('_ P P _ _');
  await expect(page.locator('#word-feedback')).toContainText('P appears 2 times');
  await expect(letter('P')).toBeDisabled();
  await expect(letter('P')).toHaveAttribute('aria-label', 'P, in the word');
  const afterP = await snapshot(page);
  expect(afterP.score).toBe(caught.score + 200);
  expect(afterP.status).toBe('guess'); // Guessing continues after a hit.

  // A duplicate, through the keyboard, changes nothing.
  await page.keyboard.press('p');
  await expect(page.locator('#word-feedback')).toContainText('already guessed');
  expect((await snapshot(page)).score).toBe(afterP.score);
  expect((await snapshot(page)).word.mask).toEqual(afterP.word.mask);

  // ---- A wrong letter starts the countdown -------------------------------
  await letter('Z').click();
  await expect(page.locator('#hud-mode')).toHaveText('Resuming');
  await expect(page.locator('#resume-overlay')).toBeVisible();
  await expect(page.locator('#resume-message')).toContainText('Z is not in the word');
  await expect(page.locator('#guess-panel')).toBeHidden();
  await expect(page.locator('#word-misses')).toHaveText('Misses: Z');
  await shoot(page, testInfo, 'countdown');

  const countingDown = await snapshot(page);
  expect(countingDown.score).toBe(afterP.score); // A miss costs no points.
  expect(countingDown.ball).not.toBeNull(); // One ball, already placed.
  await page.waitForTimeout(600);
  const stillFrozen = await snapshot(page);
  expect(stillFrozen.player).toEqual(countingDown.player);
  expect(stillFrozen.ball).toEqual(countingDown.ball);
  expect(stillFrozen.resumeRemainingMs).toBeLessThan(countingDown.resumeRemainingMs);

  // Keys pressed during the countdown reach neither mode.
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('a');
  expect((await snapshot(page)).word).toEqual(countingDown.word);

  await expect.poll(async () => (await snapshot(page)).status, { timeout: 5_000 }).toBe('chase');
  await expect(page.locator('#word-mask')).toHaveText('_ P P _ _'); // Progress kept.

  // ---- Second catch and the solve ----------------------------------------
  await chaseUntilCaught(page, maze);
  await expect(page.locator('#guess-panel')).toBeVisible();
  const beforeSolve = await snapshot(page);

  for (const character of ['A', 'L', 'E']) {
    await letter(character).click();
  }

  await expect(page.locator('#result-screen')).toBeVisible();
  await expect(page.locator('#result-heading')).toBeFocused();
  await expect(page.locator('#result-word')).toHaveText(WORD);
  await expect(page.locator('#result-bonus')).toHaveText('1000');
  await expect(page.locator('#hud-mode')).toHaveText('Solved');
  await shoot(page, testInfo, 'result');

  const solved = await snapshot(page);
  // Three letters covering three positions, then the single word bonus.
  expect(solved.score).toBe(beforeSolve.score + 3 * 100 + 1000);
  expect(solved.word.answer).toBe(WORD);
  await expect(page.locator('#result-score')).toHaveText(String(solved.score));

  // Further letters cannot award a second bonus.
  await page.keyboard.press('e');
  await page.waitForTimeout(200);
  expect((await snapshot(page)).score).toBe(solved.score);

  // ---- Play again --------------------------------------------------------
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('#result-screen')).toBeHidden();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  await expect(page.locator('#word-mask')).toHaveText('_ _ _ _ _');
  await expect(page.locator('#word-misses')).toHaveText('Misses: none');
  // The guessed state is cleared; letters stay disabled until the next catch.
  await expect(letter('P')).toHaveAttribute('data-state', '');
  await expect(letter('P')).toHaveAttribute('aria-label', 'P');
  await expect(letter('P')).toBeDisabled();

  const replay = await snapshot(page);
  expect(replay.score).toBe(0);
  expect(replay.dotsRemaining).toBe(maze.dotTiles.length);
  expect(replay.ball).not.toBeNull();
  expect(replay.word.revealedLetters).toEqual([]);
});

test('the title screen action abandons a solved round', async ({ page }) => {
  const maze = createLevelOneMaze();
  await page.getByRole('button', { name: 'Start game' }).click();
  await chaseUntilCaught(page, maze);
  for (const character of ['A', 'P', 'L', 'E']) {
    await page.locator(`[data-letter="${character}"]`).click();
  }

  await expect(page.locator('#result-screen')).toBeVisible();
  await page.getByRole('button', { name: 'Title screen' }).click();
  await expect(page.locator('#title-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start game' })).toBeFocused();
  expect((await snapshot(page)).status).toBe('title');
});

test('touch controls chase and guess with the same rules', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch-only journey');
  const maze = createLevelOneMaze();

  await page.getByRole('button', { name: 'Start game' }).tap();
  await chaseUntilCaught(page, maze, 'pad');

  await expect(page.locator('#guess-panel')).toBeVisible();
  await page.locator('[data-letter="P"]').tap();
  await expect(page.locator('#word-mask')).toHaveText('_ P P _ _');
  await expect(page.locator('[data-letter="P"]')).toBeDisabled();

  // A tap on a miss moves to the countdown and no further.
  await page.locator('[data-letter="Q"]').tap();
  await expect(page.locator('#resume-overlay')).toBeVisible();
  await expect(page.locator('#word-misses')).toHaveText('Misses: Q');
  expect((await snapshot(page)).word.wrongLetters).toEqual(['Q']);
});
