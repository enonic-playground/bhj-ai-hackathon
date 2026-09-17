import type { Page } from '@playwright/test';
import type { ActorSnapshot, EnemySnapshot, GameSnapshot } from '../src/game/game.js';
import { DIRECTIONS, type Direction } from '../src/game/direction.js';
import { neighbor, positionKey, wrapIndex, type GridPosition, type Maze } from '../src/game/maze.js';
import { pathDistances } from '../src/game/paths.js';

/** `testWord=0` pins the round to APPLE, in the Fruit category. */
export const WORD = 'APPLE';
export const CATEGORY = 'Fruit';

/** A pinned round with the real four enemies, for the M3 journeys. */
export const FIXTURE = '/?testWord=0&testSeed=7';

/**
 * The same pinned round with no enemies at all. The M1 and M2 journeys assert
 * movement, layout, focus and the guessing loop; a legitimate death would
 * interrupt those assertions without telling us anything about them. Every M3
 * journey, and the production smoke, keep the real enemies.
 */
export const CALM_FIXTURE = '/?testWord=0&testSeed=7&testEnemies=off';

/** Letters that are never in APPLE, for journeys that need a wrong guess. */
export const WRONG_LETTERS = 'ZXQWYBCDFGHJKMNORSTUVI'.split('');

/** How close a lethal enemy may get, in path tiles, before the route avoids it. */
const DANGER_TILES = 4;

const KEYS: Record<Direction, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

export async function snapshot(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => {
    const api = window.__hacman;
    if (!api) throw new Error('test readout is unavailable');
    return api.getSnapshot();
  });
}

export function tileOf(maze: Maze, actor: ActorSnapshot): GridPosition {
  return {
    col: wrapIndex(Math.round(actor.x), maze.width),
    row: wrapIndex(Math.round(actor.y), maze.height),
  };
}

/** Path distance from `from` to the nearest enemy in `enemies`, or Infinity. */
function distanceToNearest(
  maze: Maze,
  from: GridPosition,
  enemies: readonly EnemySnapshot[],
): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    const distances = pathDistances(maze, tileOf(maze, enemy));
    nearest = Math.min(nearest, distances.get(positionKey(from)) ?? Number.POSITIVE_INFINITY);
  }
  return nearest;
}

/**
 * The turn a careful player would take: the legal move that gets closest to
 * `target`, preferring moves that keep a lethal enemy at least a few tiles
 * away. With nowhere safe it runs for the roomiest option instead.
 *
 * This is ordinary play through the public snapshot: the test reads what a
 * player can see and presses a key. It is not a claim that the pacing feels
 * right — that needs a human, and is recorded as unverified.
 */
export function routeDirection(
  maze: Maze,
  state: GameSnapshot,
  target: GridPosition,
  avoidEnemies = true,
): Direction | null {
  const distances = pathDistances(maze, target);
  const from = tileOf(maze, state.player);
  const threats =
    !avoidEnemies || state.protectionRemainingMs > 0
      ? []
      : state.enemies.filter((enemy) => enemy.lethal);

  let best: Direction | null = null;
  let bestTargetDistance = Number.POSITIVE_INFINITY;
  let safest: Direction | null = null;
  let safestGap = -1;

  for (const direction of DIRECTIONS) {
    const next = neighbor(maze, from, direction);
    if (!next) continue;
    const toTarget = distances.get(positionKey(next)) ?? Number.POSITIVE_INFINITY;
    const gap = distanceToNearest(maze, next, threats);

    if (gap > safestGap || (gap === safestGap && toTarget < bestTargetDistance)) {
      safestGap = gap;
      safest = direction;
    }
    if (gap >= DANGER_TILES && toTarget < bestTargetDistance) {
      bestTargetDistance = toTarget;
      best = direction;
    }
  }
  return best ?? safest;
}

async function press(page: Page, direction: Direction, input: 'keyboard' | 'pad'): Promise<void> {
  if (input === 'keyboard') {
    await page.keyboard.press(KEYS[direction]);
    return;
  }
  // The catch can land between reading the snapshot and tapping, and the pad is
  // hidden the moment guessing opens. That is the behaviour under test, so a
  // vanished pad simply ends the chase on the next look.
  await page
    .locator(`[data-direction="${direction}"]`)
    .tap({ timeout: 1_000 })
    .catch(() => undefined);
}

export interface DriveOptions {
  /** Where the player is heading, or a function of the current state. */
  readonly target: (state: GameSnapshot) => GridPosition | null;
  /** True when the journey has got what it came for. */
  readonly done: (state: GameSnapshot) => boolean;
  readonly input?: 'keyboard' | 'pad';
  readonly timeoutMs?: number;
  /** False walks straight at the target, enemies and all. */
  readonly avoidEnemies?: boolean;
  /** Guess a known-wrong letter to leave a capture, rather than failing. */
  readonly leaveGuessing?: boolean;
  readonly what?: string;
}

/**
 * Plays the game with its own controls until `done` reports true.
 *
 * Nothing is teleported or injected: the helper reads the public snapshot,
 * decides on a turn, and presses the key or taps the pad exactly as a player
 * would. Deaths and countdowns are simply waited out, because both are part of
 * ordinary play once there are enemies in the maze.
 */
export async function drive(page: Page, maze: Maze, options: DriveOptions): Promise<GameSnapshot> {
  const deadline = Date.now() + (options.timeoutMs ?? 60_000);
  const input = options.input ?? 'keyboard';
  let lastPressed: Direction | null = null;

  while (Date.now() < deadline) {
    const state = await snapshot(page);
    if (options.done(state)) {
      return state;
    }
    if (state.status === 'game-over') {
      throw new Error(`the run ended before ${options.what ?? 'the goal'} was reached`);
    }
    if (state.status === 'guess') {
      if (!options.leaveGuessing) {
        throw new Error('the chase was interrupted by a capture');
      }
      // A letter already guessed is disabled, so the one picked here has to be
      // one this round has not seen, however many captures it has been through.
      const used = new Set([...state.word.wrongLetters, ...state.word.revealedLetters]);
      const letter = WRONG_LETTERS.find((candidate) => !used.has(candidate));
      if (!letter) {
        throw new Error('every wrong letter has been guessed already');
      }
      await page.locator(`[data-letter="${letter}"]`).click();
      continue;
    }
    if (state.status !== 'chase') {
      await page.waitForTimeout(80); // A countdown or a death: wait it out.
      continue;
    }

    const target = options.target(state);
    const direction = target
      ? routeDirection(maze, state, target, options.avoidEnemies ?? true)
      : null;
    if (direction && (direction !== lastPressed || input === 'pad')) {
      lastPressed = direction;
      await press(page, direction, input);
    }
    await page.waitForTimeout(60);
  }
  throw new Error(`${options.what ?? 'the goal'} was never reached`);
}

/**
 * Chases the ball with the game's own controls until it is caught, avoiding
 * enemies on the way and waiting out any death the chase runs into.
 */
export async function chaseUntilCaught(
  page: Page,
  maze: Maze,
  input: 'keyboard' | 'pad' = 'keyboard',
): Promise<void> {
  await drive(page, maze, {
    target: (state) => (state.ball ? tileOf(maze, state.ball) : null),
    done: (state) => state.status === 'guess',
    input,
    what: 'the ball',
  });
}
