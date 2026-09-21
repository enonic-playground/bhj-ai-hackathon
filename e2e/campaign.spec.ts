import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import type { Direction } from '../src/game/direction.js';
import type { GameSnapshot } from '../src/game/game.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { positionKey, type GridPosition } from '../src/game/maze.js';
import { pathDistances } from '../src/game/paths.js';
import { chaseUntilCaught, routeDirection, snapshot, tileOf } from './support.js';

/**
 * Five distinct words, pinned in level order by `testWords` (indices into
 * `SEED_WORDS`), so this deterministic journey can solve every level without
 * the runtime snapshot ever revealing an unsolved answer: the test itself
 * chose these words through the query string, the same fixture-only
 * allowance the M2/M3 journeys use for a single pinned word.
 */
const WORDS = ['APPLE', 'GUITAR', 'PLANET', 'BALLOON', 'RIVER'];
const CAMPAIGN_FIXTURE = '/?testWords=0,1,2,3,4&testSeed=13&testEnemies=off';
/**
 * The fruit journey is about dot consumption and thresholds, not capture, and
 * reaching the first threshold already means sweeping roughly a third of the
 * maze's 200-plus dots. Disabling the ball keeps an incidental catch from
 * repeatedly freezing the sweep for a countdown and a respawned ball.
 */
const DOT_SWEEP_FIXTURE = '/?testBall=off&testEnemies=off';

const MAZE = createLevelOneMaze();
const consoleErrors = new WeakMap<Page, string[]>();

// A complete five-level campaign, each with a real catch and solve, needs
// well beyond Playwright's default per-test budget.
test.setTimeout(150_000);

async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `docs/evidence/m4/${testInfo.project.name}-${name}.png` });
}

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

/** Solves the current level's known word with real letter presses. */
async function solveLevel(page: Page, word: string): Promise<void> {
  for (const letter of new Set(word)) {
    await page.locator(`[data-letter="${letter}"]`).click();
  }
}

test('five levels complete the campaign with real capture, guesses and Next level', async ({
  page,
}, testInfo) => {
  await page.goto(CAMPAIGN_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-level')).toHaveText('1/5');
  await expect(page.locator('#word-category')).toHaveText('Fruit');

  let previousScore = 0;
  for (let level = 1; level <= 5; level += 1) {
    await expect(page.locator('#hud-level')).toHaveText(`${level}/5`);
    await chaseUntilCaught(page, MAZE);
    await expect(page.locator('#guess-panel')).toBeVisible();
    await solveLevel(page, WORDS[level - 1] as string);

    const solvedScore = (await snapshot(page)).score;
    expect(solvedScore).toBeGreaterThan(previousScore); // The word bonus landed.
    previousScore = solvedScore;

    if (level < 5) {
      await expect(page.locator('#result-screen')).toBeVisible();
      await expect(page.locator('#result-word')).toHaveText(WORDS[level - 1] as string);
      await shoot(page, testInfo, `level-${level}-solved`);
      await page.getByRole('button', { name: 'Next level' }).click();
      await expect(page.locator('#result-screen')).toBeHidden();
      const afterAdvance = await snapshot(page);
      expect(afterAdvance.level).toBe(level + 1);
      expect(afterAdvance.score).toBe(previousScore); // Preserved across the transition.
      expect(afterAdvance.lives).toBeGreaterThan(0);
      expect(afterAdvance.word.revealedLetters).toEqual([]);
    }
  }

  await expect(page.locator('#campaign-complete-screen')).toBeVisible();
  await expect(page.locator('#campaign-complete-heading')).toBeFocused();
  await expect(page.locator('#campaign-complete-word')).toHaveText(WORDS[4] as string);
  await expect(page.locator('#hud-mode')).toHaveText('Campaign complete');
  await shoot(page, testInfo, 'campaign-complete');

  const finished = await snapshot(page);
  expect(finished.level).toBe(5);
  expect(finished.status).toBe('campaign-complete');
  await expect(page.locator('#campaign-complete-score')).toHaveText(String(finished.score));

  // Never a level six, and nothing the player presses changes the frozen run.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('a');
  await page.waitForTimeout(300);
  expect((await snapshot(page)).level).toBe(5);

  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  const replay = await snapshot(page);
  expect(replay.level).toBe(1);
  expect(replay.score).toBe(0);
  expect(replay.lives).toBe(3);
});

const CHASE_KEYS: Record<Direction, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

function isAtCentre(value: number, epsilon = 0.1): boolean {
  return Math.abs(value - Math.round(value)) < epsilon;
}

/**
 * Drives toward whatever `nextTarget` currently names, one legal step at a
 * time, until `done` reports true or the budget runs out. A routing decision
 * is made only when the player is actually at a tile centre: deciding from a
 * rounded, still mid-tile position is unreliable the moment `Math.round`
 * snaps ahead to the destination tile early, which reads as "already
 * arrived, so leave again" and reverses the player one polling interval
 * before it truly gets there.
 */
async function driveAtCentres(
  page: Page,
  nextTarget: (state: GameSnapshot, from: GridPosition) => GridPosition | null,
  done: (state: GameSnapshot) => boolean,
  timeoutMs: number,
): Promise<GameSnapshot> {
  let decidedAt: string | null = null;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const state = await snapshot(page);
    if (done(state)) {
      return state;
    }

    if (isAtCentre(state.player.x) && isAtCentre(state.player.y)) {
      const from = tileOf(MAZE, state.player);
      const key = positionKey(from);
      if (key !== decidedAt) {
        decidedAt = key;
        const target = nextTarget(state, from);
        const direction = target ? routeDirection(MAZE, state, target, false) : null;
        if (direction) {
          await page.keyboard.press(CHASE_KEYS[direction]);
        }
      }
    }
    await page.waitForTimeout(30);
  }
  throw new Error('the drive never finished within its time budget');
}

/**
 * Sweeps every reachable dot until `done` reports true. Each visited tile is
 * excluded from later targeting, since the snapshot reports only a dot
 * count, not which specific tiles still carry one, so the nearest tile by
 * distance alone would otherwise be re-targeted forever once emptied.
 */
function sweepDots(page: Page, done: (state: GameSnapshot) => boolean, timeoutMs: number) {
  const visited = new Set<string>();
  let target: GridPosition | null = null;
  return driveAtCentres(
    page,
    (_state, from) => {
      if (target && positionKey(from) === positionKey(target)) {
        target = null;
      }
      visited.add(positionKey(from));
      if (!target) {
        const distances = pathDistances(MAZE, from);
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const dot of MAZE.dotTiles) {
          if (visited.has(positionKey(dot))) continue;
          const distance = distances.get(positionKey(dot)) ?? Number.POSITIVE_INFINITY;
          if (distance > 0 && distance < bestDistance) {
            bestDistance = distance;
            target = dot;
          }
        }
      }
      return target;
    },
    done,
    timeoutMs,
  );
}

test('fruit appears at both thresholds, scores once collected, and leaves no trace once gone', async ({
  page,
}, testInfo) => {
  test.setTimeout(100_000);
  await page.goto(DOT_SWEEP_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  const state = await sweepDots(page, (candidate) => candidate.fruit !== null, 60_000);
  expect(state.fruit).not.toBeNull();
  await shoot(page, testInfo, 'fruit-spawned');

  const before = state;
  const fruitTile = state.fruit?.position as GridPosition;
  const collected = await driveAtCentres(
    page,
    () => fruitTile,
    (candidate) => candidate.fruit === null,
    30_000,
  );
  // Any dots on the path to the fruit tile score too, so only the difference
  // the dot count itself does not explain is attributed to the fruit.
  const dotsEatenEnRoute = before.dotsRemaining - collected.dotsRemaining;
  const scoreFromDots = dotsEatenEnRoute * DEFAULT_CONFIG.dotScore;
  expect(collected.score).toBe(before.score + scoreFromDots + 100 * collected.level);
  await shoot(page, testInfo, 'fruit-collected');
});

test('best score persists across a reload, and survives corrupted storage', async ({ page }) => {
  await page.goto(CAMPAIGN_FIXTURE);
  await expect(page.locator('#title-best-score')).toHaveText('0');

  await page.getByRole('button', { name: 'Start game' }).click();
  await page.keyboard.press('ArrowLeft'); // Movement continues in this direction once started.
  await expect
    .poll(async () => (await snapshot(page)).score, { timeout: 10_000 })
    .toBeGreaterThan(0);
  const score = (await snapshot(page)).score;

  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('button', { name: 'Title screen' }).click();
  await expect(page.locator('#title-best-score')).toHaveText(String(score));

  await page.reload();
  await expect(page.locator('#title-best-score')).toHaveText(String(score));

  // Corrupted storage must not crash the page or the best-score readout, and
  // play must still work: the session's in-memory best simply starts at zero.
  await page.evaluate(() => window.localStorage.setItem('hacman.bestScore.v1', 'not json'));
  await page.reload();
  await expect(page.locator('#title-best-score')).toHaveText('0');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
});

test('the campaign-complete panel stays usable on a touch screen', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch-only journey');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');

  await page.goto(CAMPAIGN_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).tap();

  for (let level = 1; level <= 5; level += 1) {
    await chaseUntilCaught(page, MAZE, 'pad');
    await solveLevel(page, WORDS[level - 1] as string);
    if (level < 5) {
      await page.getByRole('button', { name: 'Next level' }).tap();
    }
  }

  await expect(page.locator('#campaign-complete-screen')).toBeVisible({ timeout: 20_000 });
  for (const name of ['Play again', 'Title screen']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    if (!box) throw new Error(`No ${name} button`);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
