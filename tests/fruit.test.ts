import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { Game } from '../src/game/game.js';
import { createMaze } from '../src/game/maze.js';
import {
  createTestGame,
  NO_BALL,
  placeEnemyOnPlayer,
  placePlayer,
  runForMs,
  steerPlayerTo,
  STEP_SECONDS,
} from './fixtures.js';

/**
 * A single 12-dot corridor (spawn at column 1, dots at columns 2–13) with one
 * enemy home branching off its midpoint. Twelve dots gives clean, exact
 * threshold arithmetic: `ceil(0.3 * 12) = 4`, `ceil(0.7 * 12) = 9`. The
 * straight line lets every test reach an exact dot count with `steerPlayerTo`
 * instead of timing a sweep.
 */
const FRUIT_LAYOUT = [
  '###############',
  '#P............#',
  '######=########',
  '######h########',
  '######E########',
  '###############',
] as const;

function fruitMaze() {
  return createMaze([...FRUIT_LAYOUT]);
}

const CHASER = {
  id: 'chaser',
  name: 'Chaser',
  kind: 'chaser' as const,
  scatterTarget: { col: 13, row: 1 },
  patrolWaypoints: [],
  releaseDelayMs: 10 * 60 * 1000, // Long enough to stay home for the whole test.
};

function fruitGame(): Game {
  const game = createTestGame(fruitMaze(), {
    selectBallSpawn: NO_BALL,
    enemies: [CHASER],
  });
  game.startLevel();
  return game;
}

describe('fruit thresholds', () => {
  it('does not spawn before the first threshold, then fires it exactly at four dots', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 4, row: 1 }); // Three dots consumed.
    expect(game.fruit).toBeNull();

    steerPlayerTo(game, { col: 5, row: 1 }); // The fourth dot crosses the threshold.
    expect(game.fruit).not.toBeNull();
    expect(game.fruit?.position).toEqual(game.maze.spawn);
    expect(game.fruit?.remainingMs).toBeGreaterThan(DEFAULT_CONFIG.fruitLifetimeMs - 200);
    expect(game.fruit?.remainingMs).toBeLessThanOrEqual(DEFAULT_CONFIG.fruitLifetimeMs);
  });

  it('awards fruitScorePerLevel times the level once on collection', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 5, row: 1 }); // Fires the threshold.
    const before = game.score;

    steerPlayerTo(game, { col: 1, row: 1 }); // Walk back over the spawn tile.
    expect(game.fruit).toBeNull();
    expect(game.score).toBe(before + DEFAULT_CONFIG.fruitScorePerLevel * game.level);

    // Standing on the now-empty spawn tile scores nothing further.
    const afterCollect = game.score;
    runForMs(game, 200);
    expect(game.score).toBe(afterCollect);
  });

  it('expires after ten active seconds if never collected', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 5, row: 1 });
    expect(game.fruit).not.toBeNull();
    // Parked and facing nowhere, so the wait below is idle time for the fruit
    // timer only, not more dots consumed by continued rightward momentum.
    placePlayer(game, { col: 5, row: 1 });

    runForMs(game, DEFAULT_CONFIG.fruitLifetimeMs - 200);
    expect(game.fruit).not.toBeNull();
    runForMs(game, 400);
    expect(game.fruit).toBeNull();
  });

  it('queues a second fruit behind the first and spawns it only once the first is gone', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 5, row: 1 }); // Threshold one: fruit A appears.
    const fruitA = game.fruit;
    expect(fruitA).not.toBeNull();

    steerPlayerTo(game, { col: 10, row: 1 }); // Threshold two fires while A is still up.
    expect(game.fruit).toEqual(fruitA); // Never overwritten; at most one fruit is visible.

    runForMs(game, DEFAULT_CONFIG.fruitLifetimeMs); // A expires, freeing the slot.
    expect(game.fruit).not.toBeNull();
    expect(game.fruit).not.toEqual(fruitA);
    expect(game.fruit?.position).toEqual(game.maze.spawn);
  });

  it('freezes the fruit timer outside chase', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 5, row: 1 });
    const remaining = game.fruit?.remainingMs;

    game.pause('manual');
    runForMs(game, 3000);
    expect(game.fruit?.remainingMs).toBe(remaining);

    game.resume();
    runForMs(game, 200);
    expect(game.fruit?.remainingMs).toBeLessThan(remaining as number);
  });

  it('death clears the active fruit, and the fired threshold never refires', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 5, row: 1 }); // Threshold one fires: four dots consumed.
    expect(game.fruit).not.toBeNull();

    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');
    runForMs(game, DEFAULT_CONFIG.dyingPresentationMs + 50);
    expect(game.status).toBe('chase');
    expect(game.fruit).toBeNull(); // Death clears it; it is not still waiting to be collected.

    // One more dot pushes consumption to five, still short of the second
    // threshold at nine. If death had reset the fired flag instead of only
    // clearing the fruit, this single dot would incorrectly refire the first
    // threshold, since consumption already passed four before death.
    steerPlayerTo(game, { col: 6, row: 1 });
    expect(game.fruit).toBeNull();

    // Reaching nine dots total fires the second, still-untouched threshold.
    steerPlayerTo(game, { col: 10, row: 1 });
    expect(game.fruit).not.toBeNull();
    expect(game.fruit?.position).toEqual(game.maze.spawn);
  });
});
