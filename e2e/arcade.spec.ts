import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import type { GameSnapshot } from '../src/game/game.js';
import { positionKey, type GridPosition } from '../src/game/maze.js';
import { pathDistances } from '../src/game/paths.js';
import { FIXTURE, WORD, chaseUntilCaught, drive, snapshot, tileOf } from './support.js';

/**
 * The M3 journeys. Every one of these runs against the real four enemies: the
 * only pinned things are the word and the random seed, exactly as in M2.
 */

const MAZE = createLevelOneMaze();
/** Somewhere to run to while watching something else happen. */
const FAR_CORNER: GridPosition = { col: 1, row: 21 };
const consoleErrors = new WeakMap<Page, string[]>();

// These journeys play real rounds against real enemies, including losing three
// lives in a row, so they need more than the default per-test budget.
test.setTimeout(150_000);

async function shoot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: `docs/evidence/m3/${testInfo.project.name}-${name}.png` });
}

async function start(page: Page): Promise<void> {
  await page.goto(FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
}

/** Enemies that have not joined the maze yet: waiting or on their way out. */
function stillHome(state: GameSnapshot): number {
  return state.enemies.filter((enemy) => enemy.state === 'home' || enemy.state === 'exiting').length;
}

/**
 * The pellet closest to the player along real maze paths. The snapshot only
 * carries the count, so this walks the authored tiles and skips the corner the
 * player is standing on once it has been eaten.
 */
function nearestPellet(state: GameSnapshot): GridPosition | null {
  if (state.pelletsRemaining === 0) return null;
  const distances = pathDistances(MAZE, tileOf(MAZE, state.player));
  const playerTile = tileOf(MAZE, state.player);
  let best: GridPosition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const pellet of MAZE.powerPelletTiles) {
    if (positionKey(pellet) === positionKey(playerTile)) continue;
    const distance = distances.get(positionKey(pellet)) ?? Number.POSITIVE_INFINITY;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pellet;
    }
  }
  return best;
}

function nearestEdible(state: GameSnapshot): GridPosition | null {
  const edible = state.enemies.filter((enemy) => enemy.edible);
  if (edible.length === 0) return null;
  const distances = pathDistances(MAZE, tileOf(MAZE, state.player));
  let best: GridPosition | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const enemy of edible) {
    const tile = tileOf(MAZE, enemy);
    const distance = distances.get(positionKey(tile)) ?? Number.POSITIVE_INFINITY;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return best;
}

/** Walks into the nearest lethal enemy on purpose, and waits for the death. */
async function dieOnPurpose(page: Page): Promise<void> {
  await drive(page, MAZE, {
    target: (state) => {
      const lethal = state.enemies.filter((enemy) => enemy.lethal);
      return lethal[0] ? tileOf(MAZE, lethal[0]) : null;
    },
    done: (state) => state.status === 'dying' || state.status === 'game-over',
    leaveGuessing: true,
    // Walking into an enemy on purpose is the point here, so the route does
    // not step around them.
    avoidEnemies: false,
    what: 'a death',
    timeoutMs: 45_000,
  });
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

test('three lives, four enemies that all leave home and roam separately', async ({ page }, testInfo) => {
  await page.goto(FIXTURE);
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();

  // Before the run starts, all four are waiting inside the home, which neither
  // the player nor the ball can enter.
  const title = await snapshot(page);
  expect(title.lives).toBe(3);
  expect(title.enemies).toHaveLength(4);
  expect(title.enemies.map((enemy) => enemy.id)).toEqual([
    'chaser',
    'ambusher',
    'patroller',
    'prowler',
  ]);
  expect(title.enemies.every((enemy) => enemy.state === 'home')).toBe(true);

  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  await expect(page.locator('#hud-lives')).toContainText('3');

  // Released on the documented offsets, they are all out within eight seconds.
  await expect
    .poll(
      async () => (await snapshot(page)).enemies.filter((enemy) => enemy.state === 'roaming').length,
      { timeout: 20_000 },
    )
    .toBe(4);

  const roaming = await snapshot(page);
  const home = MAZE.home;
  if (!home) throw new Error('level one must author an enemy home');
  const homeTiles = new Set(home.tiles.map(positionKey));

  for (const enemy of roaming.enemies) {
    expect(homeTiles.has(positionKey(tileOf(MAZE, enemy)))).toBe(false);
    expect(enemy.lethal).toBe(true);
  }
  // They occupy different places, which is what tells four policies apart on
  // screen; the deterministic per-policy targets are covered by unit checks.
  const places = new Set(roaming.enemies.map((enemy) => positionKey(tileOf(MAZE, enemy))));
  expect(places.size).toBeGreaterThan(1);
  // The ball is a separate actor that never became an enemy.
  expect(roaming.ball).not.toBeNull();

  await shoot(page, testInfo, 'chase-enemies');
});

test('a pellet scores, turns the enemies blue, and an eaten one goes home and returns', async ({
  page,
}, testInfo) => {
  await start(page);

  const beforePellet = await snapshot(page);
  const afterPellet = await drive(page, MAZE, {
    target: nearestPellet,
    done: (state) => state.frightenedRemainingMs > 0,
    leaveGuessing: true,
    what: 'a power pellet',
  });

  expect(afterPellet.pelletsRemaining).toBeLessThan(beforePellet.pelletsRemaining);
  expect(afterPellet.frightenedRemainingMs).toBeGreaterThan(0);
  expect(afterPellet.enemies.some((enemy) => enemy.edible)).toBe(true);
  await shoot(page, testInfo, 'frightened');

  // Chase one of the blue enemies down with the ordinary movement controls. If
  // the six seconds run out first, the player heads for the next pellet and
  // tries again, which is exactly what a player would do.
  const scoreBefore = afterPellet.score;
  const afterEat = await drive(page, MAZE, {
    target: (state) => nearestEdible(state) ?? nearestPellet(state),
    done: (state) => state.enemiesEaten > 0,
    leaveGuessing: true,
    what: 'a frightened enemy',
    timeoutMs: 45_000,
  });
  expect(afterEat.score).toBeGreaterThanOrEqual(scoreBefore + DEFAULT_CONFIG.enemyEatScores[0]!);

  const eaten = afterEat.enemies.find((enemy) => enemy.state === 'returning');
  expect(eaten).toBeDefined();
  // On its way home it can neither kill nor be eaten again.
  expect(eaten?.lethal).toBe(false);
  expect(eaten?.edible).toBe(false);

  // It reaches the home, waits there, then rejoins play rather than vanishing.
  // The player keeps running from the others meanwhile, so the observation is
  // of a real return rather than of the reset a death would cause.
  let waitedAtHome = false;
  await drive(page, MAZE, {
    target: () => FAR_CORNER,
    done: (state) => {
      const enemy = state.enemies.find((candidate) => candidate.id === eaten?.id);
      if (enemy?.state === 'resting') waitedAtHome = true;
      return waitedAtHome && enemy?.state === 'roaming';
    },
    leaveGuessing: true,
    what: 'the eaten enemy rejoining play',
    timeoutMs: 40_000,
  });
  expect(waitedAtHome).toBe(true);
  await shoot(page, testInfo, 'rejoined');
});

test('a death costs one life, keeps every bit of progress and grants protection', async ({
  page,
}, testInfo) => {
  await start(page);

  // Build up something to lose: a caught ball, a wrong letter and some dots.
  await chaseUntilCaught(page, MAZE);
  await page.locator('[data-letter="P"]').click();
  await expect(page.locator('#word-mask')).toHaveText('_ P P _ _');
  await page.locator('[data-letter="Z"]').click();
  await expect.poll(async () => (await snapshot(page)).status, { timeout: 8_000 }).toBe('chase');

  const before = await snapshot(page);
  expect(before.lives).toBe(3);

  await dieOnPurpose(page);
  await expect(page.locator('#hud-mode')).toHaveText('Caught');
  await expect(page.locator('#dying-overlay')).toBeVisible();
  await expect(page.locator('#dying-message')).toContainText('2 lives remaining');
  await shoot(page, testInfo, 'dying');

  const dying = await snapshot(page);
  expect(dying.lives).toBe(2);

  await expect.poll(async () => (await snapshot(page)).status, { timeout: 5_000 }).toBe('chase');
  const after = await snapshot(page);

  expect(after.lives).toBe(2);
  expect(after.score).toBe(dying.score);
  expect(after.word.revealedLetters).toEqual(['P']);
  expect(after.word.wrongLetters).toEqual(['Z']);
  expect(after.dotsRemaining).toBe(dying.dotsRemaining);
  expect(after.pelletsRemaining).toBe(dying.pelletsRemaining);
  expect(after.protectionRemainingMs).toBeGreaterThan(0);
  expect(after.ball).not.toBeNull();
  // The enemies went back to their start slots and their release offsets, so
  // most of them have not reached the maze again yet.
  expect(stillHome(after)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#hud-shield')).toBeVisible();
  await shoot(page, testInfo, 'protected');
});

test('losing every life reveals the word, and Restart run starts over clean', async ({
  page,
}, testInfo) => {
  await start(page);

  for (let life = 3; life > 0; life -= 1) {
    await expect.poll(async () => (await snapshot(page)).lives, { timeout: 60_000 }).toBe(life);
    await dieOnPurpose(page);
    // Each pass has to be a real death, not the tail of the previous one.
    await expect.poll(async () => (await snapshot(page)).lives, { timeout: 20_000 }).toBe(life - 1);
    if (life === 1) break;

    // The next death is only possible once the round is running again and the
    // protection the respawn granted has run out.
    await expect
      .poll(async () => (await snapshot(page)).status, { timeout: 20_000 })
      .not.toBe('dying');
    await expect
      .poll(async () => (await snapshot(page)).protectionRemainingMs, { timeout: 20_000 })
      .toBe(0);
  }

  await expect(page.locator('#game-over-screen')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#game-over-heading')).toBeFocused();
  await expect(page.locator('#game-over-word')).toHaveText(WORD);
  await expect(page.locator('#hud-mode')).toHaveText('Game over');
  await shoot(page, testInfo, 'game-over');

  const over = await snapshot(page);
  expect(over.lives).toBe(0);
  expect(over.word.answer).toBe(WORD);

  // Nothing the player presses changes the frozen run.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('a');
  await page.waitForTimeout(400);
  expect(await snapshot(page)).toEqual(over);

  await page.getByRole('button', { name: 'Restart run' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  const fresh = await snapshot(page);
  expect(fresh.lives).toBe(3);
  expect(fresh.score).toBe(0);
  expect(fresh.dotsRemaining).toBe(MAZE.dotTiles.length);
  expect(fresh.pelletsRemaining).toBe(MAZE.powerPelletTiles.length);
  expect(fresh.protectionRemainingMs).toBe(0);
  expect(fresh.word.wrongLetters).toEqual([]);
  expect(stillHome(fresh)).toBeGreaterThanOrEqual(3);
});

test('pause holds the chase, guessing and the countdown until Resume', async ({ page }, testInfo) => {
  await start(page);

  // ---- Paused from the chase, with the keyboard ---------------------------
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  await expect(page.locator('#pause-heading')).toBeFocused();
  await expect(page.locator('#hud-mode')).toHaveText('Paused');
  await shoot(page, testInfo, 'paused');

  const parked = await snapshot(page);
  expect(parked.pausedFrom).toBe('chase');
  await page.waitForTimeout(700);
  expect(await snapshot(page)).toEqual(parked); // Every timer and actor frozen.

  // Held keys reach nothing while the overlay is up.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('a');
  expect(await snapshot(page)).toEqual(parked);

  // Underneath, nothing is reachable by keyboard either.
  expect(
    await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>('#panel button, #pause-button')].filter(
        (element) => !element.disabled && element.offsetParent !== null,
      ).length,
    ),
  ).toBe(0);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  // ---- Paused from guessing, with the button ------------------------------
  await chaseUntilCaught(page, MAZE);
  await page.locator('[data-letter="P"]').click();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.locator('#pause-screen')).toBeVisible();
  expect((await snapshot(page)).pausedFrom).toBe('guess');

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#guess-panel')).toBeVisible();
  await expect(page.locator('#hud-mode')).toHaveText('Guessing');
  await expect(page.locator('#word-mask')).toHaveText('_ P P _ _');

  // ---- Paused from the wrong-guess countdown ------------------------------
  await page.locator('[data-letter="Z"]').click();
  await expect(page.locator('#resume-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  const counting = await snapshot(page);
  expect(counting.pausedFrom).toBe('resuming');
  expect(counting.resumeRemainingMs).toBeGreaterThan(0);

  await page.waitForTimeout(700);
  expect((await snapshot(page)).resumeRemainingMs).toBe(counting.resumeRemainingMs);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Resuming');
  await expect.poll(async () => (await snapshot(page)).status, { timeout: 8_000 }).toBe('chase');
});

test('the complete round with enemies active: catch, solve and replay', async ({ page }, testInfo) => {
  await start(page);

  for (const letter of ['A', 'P', 'L', 'E']) {
    const state = await snapshot(page);
    if (state.status !== 'guess') {
      await chaseUntilCaught(page, MAZE);
    }
    await page.locator(`[data-letter="${letter}"]`).click();
    if ((await snapshot(page)).status === 'level-complete') break;
  }

  await expect(page.locator('#result-screen')).toBeVisible();
  await expect(page.locator('#result-word')).toHaveText(WORD);
  await expect(page.locator('#result-bonus')).toHaveText(String(DEFAULT_CONFIG.wordBonusScore));
  await shoot(page, testInfo, 'solved');

  const solved = await snapshot(page);
  expect(solved.word.answer).toBe(WORD);
  // Solving is the only win: dots and pellets had nothing to do with it.
  expect(solved.dotsRemaining).toBeGreaterThan(0);

  // A further letter cannot award a second bonus.
  await page.keyboard.press('e');
  await page.waitForTimeout(200);
  expect((await snapshot(page)).score).toBe(solved.score);

  // Level one of five: Next level advances the campaign, keeping score and
  // lives, rather than restarting the run.
  await page.getByRole('button', { name: 'Next level' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  await expect(page.locator('#hud-level')).toHaveText('2/5');
  const nextLevel = await snapshot(page);
  expect(nextLevel.level).toBe(2);
  expect(nextLevel.lives).toBe(3);
  expect(nextLevel.score).toBe(solved.score);
  expect(nextLevel.pelletsRemaining).toBe(MAZE.powerPelletTiles.length);
  expect(stillHome(nextLevel)).toBeGreaterThanOrEqual(3);
});

test('lives, pause and protection stay usable on a touch screen', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.use.hasTouch, 'touch-only journey');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('No viewport');

  await page.goto(FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).tap();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  await expect(page.locator('#hud-lives')).toContainText('3');

  // Pause is a real target, reachable by touch in every active state.
  const pause = await page.locator('#pause-button').boundingBox();
  if (!pause) throw new Error('No pause button');
  expect(pause.width).toBeGreaterThanOrEqual(44);
  expect(pause.height).toBeGreaterThanOrEqual(44);
  expect(pause.x + pause.width).toBeLessThanOrEqual(viewport.width + 1);

  await page.locator('#pause-button').tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  for (const name of ['Resume', 'Restart run', 'Title screen']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    if (!box) throw new Error(`No ${name} button`);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
  await shoot(page, testInfo, 'paused-mobile');

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

  await page.getByRole('button', { name: 'Resume' }).tap();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  // The pad still drives the player, with real enemies in the maze.
  await page.locator('[data-direction="left"]').tap();
  await expect.poll(async () => (await snapshot(page)).score, { timeout: 8_000 }).toBeGreaterThan(0);
  await shoot(page, testInfo, 'chase-mobile');
});
