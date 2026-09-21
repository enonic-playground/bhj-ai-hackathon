import { expect, test, type Page } from '@playwright/test';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { WORD_BANK } from '../src/game/words.js';
import { chaseUntilCaught, snapshot } from './support.js';

/**
 * AC1: layout must hold up for content the starting HUD never shows —
 * landscape, a genuine eight-letter word and long category, many misses, a
 * five-digit score, four lives with the earned-life badge, and both of the
 * newer M4 result panels — not only the 360 × 640 starting screen the M1–M3
 * suites already cover in `e2e/layout.spec.ts`.
 */

const MAZE = createLevelOneMaze();

// `COMPUTER` / `Technology`: the real WORD_BANK's longest word length (8) and
// a category name longer than any `SEED_WORDS` entry `testWord`/`testWords`
// can reach; see `src/app/fixture.ts`'s `testBankWord`.
const BANK_INDEX = WORD_BANK.findIndex((entry) => entry.word === 'COMPUTER');
const LONG_WORD_FIXTURE = `/?testBankWord=${BANK_INDEX}&testSeed=13&testEnemies=off`;
const LONG_WORD = 'COMPUTER';
const LONG_CATEGORY = 'Technology';
// Letters absent from COMPUTER, so each is a genuine miss.
const MISS_LETTERS = ['A', 'B', 'D', 'F'];

test.beforeAll(() => {
  if (BANK_INDEX < 0) throw new Error('WORD_BANK no longer contains COMPUTER; update the fixture index');
});

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

async function overflowsHorizontally(page: Page): Promise<boolean> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  return overflow.scrollWidth > overflow.clientWidth + 1;
}

test('a landscape phone viewport fits the HUD, maze and pad together without horizontal overflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto('/?testBall=off&testEnemies=off');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  expect(await overflowsHorizontally(page)).toBe(false);
  const canvas = await page.locator('#maze-canvas').boundingBox();
  const pad = await page.locator('#pad').boundingBox();
  expect(canvas).not.toBeNull();
  expect(pad).not.toBeNull();
  expect((canvas?.y ?? 0) + (canvas?.height ?? 0)).toBeLessThanOrEqual(360 + 1);
  expect((pad?.y ?? 0) + (pad?.height ?? 0)).toBeLessThanOrEqual(360 + 1);
  for (const direction of ['up', 'down', 'left', 'right']) {
    const button = await page.locator(`[data-direction="${direction}"]`).boundingBox();
    expect(button?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(button?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.screenshot({ path: `docs/evidence/m5/${testInfo.project.name}-landscape-chase.png` });
});

test('an eight-letter word, a long category and several misses stay usable', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto(LONG_WORD_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  expect((await snapshot(page)).word.category).toBe(LONG_CATEGORY);

  for (const letter of MISS_LETTERS) {
    await chaseUntilCaught(page, MAZE);
    await expect(page.locator('#guess-panel')).toBeVisible();
    expect(await overflowsHorizontally(page)).toBe(false);
    await page.locator(`[data-letter="${letter}"]`).click();
    await expect(page.locator('#hud-mode')).toHaveText('Resuming');
    await expect(page.locator('#hud-mode')).toHaveText('Chase', { timeout: 5_000 });
  }

  await expect(page.locator('#word-misses')).toContainText(MISS_LETTERS.join(' '));
  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({ path: `docs/evidence/m5/${testInfo.project.name}-long-word-misses.png` });

  // Solve it for real, to reach the level-complete panel with the same
  // eight-letter word and long category.
  await chaseUntilCaught(page, MAZE);
  for (const letter of new Set(LONG_WORD)) {
    await page.locator(`[data-letter="${letter}"]`).click();
  }
  await expect(page.locator('#hud-mode')).toHaveText('Solved');
  await expect(page.locator('#result-word')).toHaveText(LONG_WORD);
  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({ path: `docs/evidence/m5/${testInfo.project.name}-result-panel.png` });

  // Every level is pinned to the same word/category, so the remaining four
  // levels solve immediately, reaching the campaign-complete panel too.
  for (let level = 2; level <= 5; level += 1) {
    await page.locator('#next-level-button').click();
    await chaseUntilCaught(page, MAZE);
    for (const letter of new Set(LONG_WORD)) {
      await page.locator(`[data-letter="${letter}"]`).click();
    }
    await expect(page.locator('#hud-mode')).toHaveText(level < 5 ? 'Solved' : 'Campaign complete');
  }
  expect(await overflowsHorizontally(page)).toBe(false);
  await expect(page.locator('#campaign-complete-word')).toHaveText(LONG_WORD);
  await page.screenshot({ path: `docs/evidence/m5/${testInfo.project.name}-campaign-complete-panel.png` });
});

test('a five-digit score and a four-life earned-life badge fit the HUD', async ({ page }, testInfo) => {
  // A five-digit score and the extra-life badge are both reachable only
  // through extended real play (M4's own handoff records that as
  // impractical within a session). This is a pure CSS/overflow check: it
  // writes already-rendered HUD text directly, the same way a visual/CSS
  // regression check would, without adding any game-state setter or
  // touching `Game` at all — `#hud-lives`/`#hud-score` are plain `<dd>` text.
  // The animation frame loop re-syncs the HUD from real state every frame,
  // which would otherwise overwrite injected text on the very next frame.
  // Every state change the app cares about here (Start, HUD text) already
  // runs its own synchronous `refresh()` outside that loop, so stubbing
  // `requestAnimationFrame` out entirely before the app's first script runs
  // only stops the continuous per-frame resync, not the app's own actions.
  await page.addInitScript(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.goto('/?testBall=off&testEnemies=off');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  await page.evaluate(() => {
    const score = document.querySelector('#hud-score');
    const lives = document.querySelector('#hud-lives');
    const extraLife = document.querySelector<HTMLElement>('#hud-extra-life');
    if (score) score.textContent = '48200';
    if (lives) lives.textContent = '4 ◆◆◆◆';
    if (extraLife) extraLife.hidden = false;
  });

  expect(await overflowsHorizontally(page)).toBe(false);
  const hud = await page.locator('.hud').boundingBox();
  const viewport = page.viewportSize();
  expect(hud).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((hud?.x ?? 0) + (hud?.width ?? 0)).toBeLessThanOrEqual((viewport?.width ?? 0) + 1);
  await expect(page.locator('#hud-extra-life')).toBeVisible();
  await page.screenshot({ path: `docs/evidence/m5/${testInfo.project.name}-hud-extremes.png` });
});

test('expanding install help at a short viewport still leaves the title heading reachable by scrolling', async ({
  page,
}, testInfo) => {
  // M5-R4: the "Install manually" disclosure grows the title overlay taller
  // than the viewport; plain flexbox centering then clips the panel's top
  // regardless of scrolling (scrollTop 0 already sits past it), which this
  // reproduces exactly the way the review round found it — expand, scroll
  // the overlay to its true top, then check the heading is actually there.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto('/?testBall=off&testEnemies=off');

  await page.locator('#pwa-install-help summary').click();
  await expect(page.locator('#pwa-install-help')).toHaveAttribute('open', '');

  await page.evaluate(() => document.querySelector('#title-screen')?.scrollTo(0, 0));
  const headingBox = await page.locator('#title-heading').boundingBox();
  expect(headingBox).not.toBeNull();
  expect(headingBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  await expect(page.locator('#title-heading')).toBeInViewport();

  // The disclosure itself is a full touch target, not just its text line.
  const summaryBox = await page.locator('#pwa-install-help summary').boundingBox();
  expect(summaryBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  expect(await overflowsHorizontally(page)).toBe(false);
  await page.screenshot({ path: `docs/evidence/m5/${testInfo.project.name}-install-help-expanded.png` });
});
