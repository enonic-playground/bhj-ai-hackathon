import { expect, type Page } from '@playwright/test';
import type { ActorSnapshot, GameSnapshot } from '../src/game/game.js';
import { DIRECTIONS, type Direction } from '../src/game/direction.js';
import { neighbor, positionKey, wrapIndex, type GridPosition, type Maze } from '../src/game/maze.js';
import { pathDistances } from '../src/game/spawn.js';

/** `testWord=0` pins the round to APPLE, in the Fruit category. */
export const WORD = 'APPLE';
export const CATEGORY = 'Fruit';
export const FIXTURE = '/?testWord=0&testSeed=7';

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

function tileOf(maze: Maze, actor: ActorSnapshot): GridPosition {
  return {
    col: wrapIndex(Math.round(actor.x), maze.width),
    row: wrapIndex(Math.round(actor.y), maze.height),
  };
}

/** The legal turn that moves the player closest to the ball, or null. */
export function pursuitDirection(maze: Maze, state: GameSnapshot): Direction | null {
  if (!state.ball) return null;
  const distances = pathDistances(maze, tileOf(maze, state.ball));
  const from = tileOf(maze, state.player);

  let best: Direction | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const direction of DIRECTIONS) {
    const next = neighbor(maze, from, direction);
    if (!next) continue;
    const distance = distances.get(positionKey(next)) ?? Number.POSITIVE_INFINITY;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = direction;
    }
  }
  return best;
}

/**
 * Chases the ball with the game's own controls until it is caught. Nothing is
 * teleported or injected: the test reads the public snapshot, decides on a
 * turn, and presses the key or taps the pad, exactly as a player would.
 */
export async function chaseUntilCaught(
  page: Page,
  maze: Maze,
  input: 'keyboard' | 'pad' = 'keyboard',
): Promise<void> {
  const deadline = Date.now() + 40_000;
  let lastPressed: Direction | null = null;

  while (Date.now() < deadline) {
    const state = await snapshot(page);
    if (state.status === 'guess') return;
    expect(state.status).toBe('chase');

    const direction = pursuitDirection(maze, state);
    if (direction && (direction !== lastPressed || input === 'pad')) {
      lastPressed = direction;
      if (input === 'keyboard') {
        await page.keyboard.press(KEYS[direction]);
      } else {
        // The catch can land between reading the snapshot and tapping, and the
        // pad is hidden the moment guessing opens. That is the behaviour under
        // test, so a vanished pad simply ends the chase on the next look.
        await page
          .locator(`[data-direction="${direction}"]`)
          .tap({ timeout: 1_000 })
          .catch(() => undefined);
      }
    }
    await page.waitForTimeout(60);
  }
  throw new Error('the ball was never caught');
}
