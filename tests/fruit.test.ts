import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { Game } from '../src/game/game.js';
import { createMaze, type GridPosition } from '../src/game/maze.js';
import type { WordEntry } from '../src/game/words.js';
import {
  createTestGame,
  NO_BALL,
  placeEnemyOnPlayer,
  placePlayer,
  runForMs,
  runUntil,
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

/** Far end of the fruit corridor: a ball there rolls back towards the player. */
const FAR_END = { col: 13, row: 1 };
const FRUIT_WORDS = ['FISH', 'BIRDS'] as const;

/**
 * A fruit round with a ball and a per-level word. The ball tile is read on
 * every spawn, so a test can take the ball away before a level transition
 * instead of racing it around the corridor.
 */
function fruitGameWithBall(): { game: Game; setBall: (tile: GridPosition | null) => void } {
  let ballTile: GridPosition | null = FAR_END;
  const game = createTestGame(fruitMaze(), {
    selectBallSpawn: () => ballTile,
    selectWord: ({ level }): WordEntry => ({ word: FRUIT_WORDS[level - 1] as string, category: 'Animal' }),
    enemies: [CHASER],
  });
  game.startLevel();
  return { game, setBall: (tile) => (ballTile = tile) };
}

describe('fruit edges across transitions', () => {
  it('spawns a queued fruit on the substep after the first is collected, never on the same one', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 5, row: 1 }); // Threshold one: fruit A.
    steerPlayerTo(game, { col: 10, row: 1 }); // Threshold two queues behind A.
    const beforeCollect = game.score;

    steerPlayerTo(game, { col: 1, row: 1 }); // Collect A on the spawn tile.
    const fruitValue = DEFAULT_CONFIG.fruitScorePerLevel * game.level;
    expect(game.score).toBe(beforeCollect + fruitValue);
    expect(game.fruit).toBeNull(); // The queued fruit has not appeared on the collecting substep.

    game.step(STEP_SECONDS);
    expect(game.fruit).not.toBeNull();
    expect(game.fruit?.position).toEqual(game.maze.spawn);
    // A fresh fruit with its full lifetime, not the remainder of A.
    expect(game.fruit?.remainingMs).toBeGreaterThan(DEFAULT_CONFIG.fruitLifetimeMs - 50);
    expect(game.score).toBe(beforeCollect + fruitValue); // Appearing under the player scores nothing.

    // Leaving and returning collects the second fruit exactly once.
    steerPlayerTo(game, { col: 2, row: 1 });
    steerPlayerTo(game, { col: 1, row: 1 });
    expect(game.fruit).toBeNull();
    expect(game.score).toBe(beforeCollect + 2 * fruitValue);

    // Both thresholds are spent: no third fruit, however long the level runs.
    steerPlayerTo(game, { col: 13, row: 1 });
    runForMs(game, DEFAULT_CONFIG.fruitLifetimeMs + 500);
    expect(game.fruit).toBeNull();
  });

  it('death clears a queued fruit as well as the active one, and neither threshold refires', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 5, row: 1 }); // Fruit A up.
    steerPlayerTo(game, { col: 10, row: 1 }); // Second fruit queued behind it.
    expect(game.fruit).not.toBeNull();

    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');
    runForMs(game, DEFAULT_CONFIG.dyingPresentationMs + 50);
    expect(game.status).toBe('chase');
    expect(game.fruit).toBeNull();

    // Had the queue survived death, the second fruit would appear on the next
    // substep; had a threshold been reset, the remaining dots would refire it.
    runForMs(game, 500);
    expect(game.fruit).toBeNull();
    steerPlayerTo(game, { col: 13, row: 1 }); // Every remaining dot.
    runForMs(game, DEFAULT_CONFIG.fruitLifetimeMs + 500);
    expect(game.dotsRemaining).toBe(0);
    expect(game.fruit).toBeNull();
  });

  it('freezes the fruit lifetime through guessing, the countdown and a background pause', () => {
    const { game } = fruitGameWithBall();
    steerPlayerTo(game, { col: 5, row: 1 }); // Fruit up; the ball is rolling towards us.
    expect(game.fruit).not.toBeNull();
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    const frozenAt = game.fruit?.remainingMs as number;
    expect(frozenAt).toBeGreaterThan(0);

    runForMs(game, 3000);
    expect(game.fruit?.remainingMs).toBe(frozenAt);

    expect(game.pause('away')).toBe(true); // Tab hidden while guessing.
    runForMs(game, 3000);
    expect(game.resume()).toBe(true);
    expect(game.status).toBe('guess');
    expect(game.fruit?.remainingMs).toBe(frozenAt);

    expect(game.guess('Z').outcome).toBe('wrong');
    expect(game.status).toBe('resuming');
    runForMs(game, DEFAULT_CONFIG.resumeCountdownMs / 2);
    expect(game.fruit?.remainingMs).toBe(frozenAt);
    expect(game.pause('away')).toBe(true); // Hidden mid-countdown.
    runForMs(game, 3000);
    expect(game.resume()).toBe(true);
    expect(game.status).toBe('resuming');
    expect(game.fruit?.remainingMs).toBe(frozenAt);

    runUntil(game, () => game.status === 'chase', DEFAULT_CONFIG.resumeCountdownMs);
    expect(game.fruit?.remainingMs).toBe(frozenAt); // The countdown spent none of it.
    placePlayer(game, { col: 12, row: 1 }); // Park away from the ball's spawn.
    game.step(STEP_SECONDS);
    expect(game.fruit?.remainingMs).toBeLessThan(frozenAt); // Only chase spends it.
  });

  it('resets fruit on the next level, fires both thresholds again and scores by level', () => {
    const { game, setBall } = fruitGameWithBall();
    steerPlayerTo(game, { col: 5, row: 1 }); // Level-one fruit left uncollected.
    expect(game.fruit).not.toBeNull();
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    for (const letter of 'FISH') game.guess(letter);
    expect(game.status).toBe('level-complete');
    expect(game.fruit).not.toBeNull(); // Still held on the result screen, frozen.

    setBall(null); // Level two plays without a ball, so it cannot interrupt the walk.
    expect(game.nextLevel()).toBe(true);
    expect(game.level).toBe(2);
    expect(game.fruit).toBeNull();
    runForMs(game, 500);
    expect(game.fruit).toBeNull(); // Nothing queued carried over.

    steerPlayerTo(game, { col: 4, row: 1 }); // Three dots: below threshold one again.
    expect(game.fruit).toBeNull();
    steerPlayerTo(game, { col: 5, row: 1 }); // Four dots on the fresh board.
    expect(game.fruit).not.toBeNull();

    const before = game.score;
    steerPlayerTo(game, { col: 1, row: 1 });
    expect(game.fruit).toBeNull();
    expect(game.score).toBe(before + DEFAULT_CONFIG.fruitScorePerLevel * 2);

    steerPlayerTo(game, { col: 10, row: 1 }); // Nine dots: the second threshold fires too.
    expect(game.fruit).not.toBeNull();
  });

  it('a restarted run clears active and queued fruit and re-arms both thresholds', () => {
    const game = fruitGame();
    steerPlayerTo(game, { col: 5, row: 1 });
    steerPlayerTo(game, { col: 10, row: 1 }); // One up, one queued, both thresholds spent.

    game.pause('manual');
    game.startLevel(); // Restart run from the pause overlay.
    expect(game.status).toBe('chase');
    expect(game.fruit).toBeNull();
    runForMs(game, 500);
    expect(game.fruit).toBeNull(); // The queue did not survive the restart.

    steerPlayerTo(game, { col: 5, row: 1 });
    expect(game.fruit).not.toBeNull(); // Threshold one fires again in the new run.
    const before = game.score;
    steerPlayerTo(game, { col: 1, row: 1 });
    expect(game.score).toBe(before + DEFAULT_CONFIG.fruitScorePerLevel * 1);
  });
});
