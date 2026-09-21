import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type GameConfig } from '../src/game/config.js';
import { Game } from '../src/game/game.js';
import { createMaze } from '../src/game/maze.js';
import {
  ballAt,
  corridorMaze,
  createTestGame,
  NO_BALL,
  placeEnemy,
  runUntil,
  steerPlayerTo,
  STEP_SECONDS,
} from './fixtures.js';

const BALL = { col: 5, row: 1 };

function scoreGame(config: GameConfig = DEFAULT_CONFIG): Game {
  const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt(BALL) }, config);
  game.startLevel();
  return game;
}

/**
 * A straight 12-dot corridor with one enemy home branching off it, so a dot
 * and a placed enemy can be made to share a tile deterministically: reaching
 * it in one movement both collects the dot and resolves the contact in the
 * same bounded substep.
 */
const CORRIDOR_LAYOUT = [
  '###############',
  '#P............#',
  '######=########',
  '######h########',
  '######E########',
  '###############',
] as const;

const CHASER = {
  id: 'chaser',
  name: 'Chaser',
  kind: 'chaser' as const,
  scatterTarget: { col: 13, row: 1 },
  patrolWaypoints: [],
  releaseDelayMs: 10 * 60 * 1000,
};

function corridorGame(config: GameConfig): Game {
  const game = createTestGame(
    createMaze([...CORRIDOR_LAYOUT]),
    { selectBallSpawn: NO_BALL, enemies: [CHASER] },
    config,
  );
  game.startLevel();
  return game;
}

describe('the sole extra life: exact threshold crossing', () => {
  it('is not granted just below the threshold', () => {
    const game = corridorGame({ ...DEFAULT_CONFIG, extraLifeScoreThreshold: 31 });
    steerPlayerTo(game, { col: 4, row: 1 }); // Three dots: exactly 30 points.
    expect(game.score).toBe(30);
    expect(game.snapshot().extraLifeEarned).toBe(false);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives);
  });

  it('is granted on an exact threshold hit, not only an overshoot', () => {
    const game = corridorGame({ ...DEFAULT_CONFIG, extraLifeScoreThreshold: 40 });
    steerPlayerTo(game, { col: 5, row: 1 }); // The fourth dot lands exactly on 40.
    expect(game.score).toBe(40);
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives + 1);
  });

  it('is granted only once, however much further score follows', () => {
    const game = corridorGame({ ...DEFAULT_CONFIG, extraLifeScoreThreshold: 40 });
    steerPlayerTo(game, { col: 5, row: 1 });
    expect(game.snapshot().extraLifeEarned).toBe(true);
    const lives = game.lives;

    steerPlayerTo(game, { col: 13, row: 1 }); // Every remaining dot.
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(lives);
  });
});

describe('the sole extra life: award sources and persistence', () => {
  it('can be granted from a correct letter guess', () => {
    // Low enough that whatever the corridor's dots already scored is enough.
    const game = scoreGame({ ...DEFAULT_CONFIG, extraLifeScoreThreshold: 1 });
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    expect(game.snapshot().extraLifeEarned).toBe(true); // The dots alone already crossed it.
    const lives = game.lives;

    game.guess('A'); // Would also cross it on its own; must not grant a second time.
    expect(game.lives).toBe(lives);
  });

  it('can be granted by the word bonus, including the bonus that ends the campaign', () => {
    // High enough that only the 1,000-point word bonus can cross it here.
    const game = scoreGame({ ...DEFAULT_CONFIG, extraLifeScoreThreshold: 900 });
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    expect(game.snapshot().extraLifeEarned).toBe(false);

    for (const letter of ['A', 'P', 'L', 'E']) {
      game.guess(letter);
    }
    expect(game.status).toBe('level-complete');
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives + 1);
  });

  it('survives a level transition and a death, and is cleared only by a fresh run', () => {
    const game = scoreGame({ ...DEFAULT_CONFIG, extraLifeScoreThreshold: 1 });
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    expect(game.snapshot().extraLifeEarned).toBe(true);
    const livesAfterBonus = game.lives;

    for (const letter of ['A', 'P', 'L', 'E']) game.guess(letter);
    expect(game.status).toBe('level-complete');
    expect(game.lives).toBe(livesAfterBonus);

    game.nextLevel();
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(livesAfterBonus);

    game.startLevel();
    expect(game.snapshot().extraLifeEarned).toBe(false);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives);
  });
});

describe('extra life ordering against a same-substep death', () => {
  /** Advances one substep at a time until the player is one substep short of `col`. */
  function approach(game: Game, col: number, epsilon = 0.06): void {
    for (let i = 0; i < 400; i += 1) {
      if (Math.abs(game.player.x - col) <= epsilon) return;
      game.step(STEP_SECONDS);
    }
    throw new Error(`the player never approached column ${col}`);
  }

  it('awards the crossing collectible before the lethal contact takes a life', () => {
    const game = corridorGame({ ...DEFAULT_CONFIG, extraLifeScoreThreshold: 40 });
    game.requestDirection('right');
    approach(game, 5); // One substep short of the fourth dot, at column 5.
    expect(game.score).toBe(30); // Three dots already collected: columns 2–4.

    // Placed at the very last moment, so the enemy has only this one substep
    // to react before the contact check — the same substep in which the
    // player's movement also reaches and collects the fourth dot.
    placeEnemy(game, 'chaser', { col: 5, row: 1 }, 'roaming');
    game.step(STEP_SECONDS);

    expect(game.score).toBe(40); // The fourth dot still scored.
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.status).toBe('dying');
    // One life gained from the threshold, one lost to the same-substep death:
    // the net is zero, which only holds if the award happened first.
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives);
  });
});
