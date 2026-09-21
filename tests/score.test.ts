import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type GameConfig } from '../src/game/config.js';
import { Game } from '../src/game/game.js';
import { createMaze } from '../src/game/maze.js';
import type { WordEntry } from '../src/game/words.js';
import {
  arenaEnemy,
  arenaMaze,
  ballAt,
  corridorMaze,
  createTestGame,
  NO_BALL,
  placeEnemy,
  placeEnemyOnPlayer,
  runForMs,
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

/** One fixed, realistically-lengthed word per level, easy to solve deterministically. */
const CAMPAIGN_WORDS = ['FISH', 'BIRDS', 'RABBIT', 'PENGUIN', 'ELEPHANT'] as const;

function campaignWord({ level }: { readonly level: number }): WordEntry {
  return { word: CAMPAIGN_WORDS[level - 1] as string, category: `Level ${level}` };
}

/** Catches the ball and solves the current level's known, fixed word. */
function solveLevel(game: Game): void {
  game.requestDirection('right');
  runUntil(game, () => game.status === 'guess', 5000);
  const length = game.snapshot().word.length;
  const answer = CAMPAIGN_WORDS.find((candidate) => candidate.length === length) as string;
  for (const letter of new Set(answer)) {
    game.guess(letter);
  }
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

  it('defaults the threshold to 10,000 for ordinary, unmodified play', () => {
    expect(DEFAULT_CONFIG.extraLifeScoreThreshold).toBe(10_000);
  });
});

describe('the sole extra life: award sources', () => {
  it('can be granted from a correct letter guess, not merely from dots along the way', () => {
    // Dots score nothing here, so only the guess itself can cross the threshold.
    const game = scoreGame({ ...DEFAULT_CONFIG, dotScore: 0, extraLifeScoreThreshold: 50 });
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    expect(game.score).toBe(0);
    expect(game.snapshot().extraLifeEarned).toBe(false);
    const lives = game.lives;

    game.guess('A'); // APPLE's one 'A' reveals one position: 100 points, over the 50-point threshold.
    expect(game.score).toBe(100);
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(lives + 1);

    game.guess('P'); // Two more positions revealed; must not grant a second time.
    expect(game.lives).toBe(lives + 1);
  });

  it("can be granted by an ordinary level's word bonus, without ending the campaign", () => {
    // High enough that only the 1,000-point word bonus can cross it here.
    const game = scoreGame({ ...DEFAULT_CONFIG, extraLifeScoreThreshold: 900 });
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    expect(game.snapshot().extraLifeEarned).toBe(false);

    for (const letter of ['A', 'P', 'L', 'E']) {
      game.guess(letter);
    }
    expect(game.status).toBe('level-complete');
    expect(game.level).toBe(1);
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives + 1);
  });

  it('can be granted by the final word bonus that ends the campaign, not by any earlier one', () => {
    // Dots, pellets and letters score nothing; only each level's 1,000-point
    // word bonus moves the score, so four bonuses land exactly on 4,000 and
    // only the fifth, campaign-ending bonus crosses this 4,001 threshold.
    const config: GameConfig = {
      ...DEFAULT_CONFIG,
      dotScore: 0,
      powerPelletScore: 0,
      letterScore: 0,
      extraLifeScoreThreshold: 4001,
    };
    const game = createTestGame(
      corridorMaze(),
      { selectBallSpawn: ballAt(BALL), selectWord: campaignWord },
      config,
    );
    game.startLevel();

    for (let level = 1; level <= 4; level += 1) {
      solveLevel(game);
      expect(game.status).toBe('level-complete');
      expect(game.snapshot().extraLifeEarned).toBe(false);
      game.nextLevel();
    }
    expect(game.score).toBe(4000);

    solveLevel(game);
    expect(game.status).toBe('campaign-complete');
    expect(game.score).toBe(5000);
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives + 1);
  });

  it('can be granted by a power pellet', () => {
    const config: GameConfig = {
      ...DEFAULT_CONFIG,
      dotScore: 0,
      extraLifeScoreThreshold: DEFAULT_CONFIG.powerPelletScore,
    };
    const game = createTestGame(arenaMaze(), { selectBallSpawn: NO_BALL, enemies: [] }, config);
    game.startLevel();
    expect(game.snapshot().extraLifeEarned).toBe(false);

    steerPlayerTo(game, { col: 1, row: 1 }); // A power pellet tile; the dots along the way score nothing.
    expect(game.score).toBe(config.powerPelletScore);
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives + 1);
  });

  it('can be granted by eating a frightened enemy', () => {
    const config: GameConfig = {
      ...DEFAULT_CONFIG,
      dotScore: 0,
      powerPelletScore: 0,
      extraLifeScoreThreshold: DEFAULT_CONFIG.enemyEatScores[0] ?? 0,
    };
    const game = createTestGame(
      arenaMaze(),
      { selectBallSpawn: NO_BALL, enemies: [arenaEnemy('chaser', { releaseDelayMs: 10 * 60 * 1000 })] },
      config,
    );
    game.startLevel();

    steerPlayerTo(game, { col: 1, row: 1 }); // The power pellet: starts frightened, scores nothing here.
    expect(game.score).toBe(0);
    expect(game.snapshot().extraLifeEarned).toBe(false);

    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);

    expect(game.score).toBe(config.extraLifeScoreThreshold);
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives + 1);
  });

  it('can be granted by collecting fruit', () => {
    const config: GameConfig = {
      ...DEFAULT_CONFIG,
      dotScore: 0,
      extraLifeScoreThreshold: DEFAULT_CONFIG.fruitScorePerLevel, // Fruit scores this × level 1.
    };
    const game = corridorGame(config);

    steerPlayerTo(game, { col: 5, row: 1 }); // Four dots consumed: the first threshold, ⌈0.3×12⌉.
    expect(game.score).toBe(0);
    expect(game.snapshot().extraLifeEarned).toBe(false);

    steerPlayerTo(game, { col: 1, row: 1 }); // Fruit spawned back at the maze's own spawn tile.
    expect(game.score).toBe(config.extraLifeScoreThreshold);
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives + 1);
  });
});

describe('the sole extra life: persistence across a level, a real death and a restart', () => {
  it('survives a level transition and a real death, and is cleared only by a fresh run', () => {
    const BALL_TILE = { col: 9, row: 6 };
    const config: GameConfig = { ...DEFAULT_CONFIG, extraLifeScoreThreshold: 1 };
    const game = createTestGame(
      arenaMaze(),
      {
        selectBallSpawn: ballAt(BALL_TILE),
        enemies: [arenaEnemy('chaser', { releaseDelayMs: 10 * 60 * 1000 })],
      },
      config,
    );
    game.startLevel();

    steerPlayerTo(game, BALL_TILE);
    expect(game.status).toBe('guess');
    expect(game.snapshot().extraLifeEarned).toBe(true); // The arena's dots alone already crossed threshold 1.
    const livesAfterBonus = game.lives;

    for (const letter of ['A', 'P', 'L', 'E']) game.guess(letter);
    expect(game.status).toBe('level-complete');
    expect(game.lives).toBe(livesAfterBonus);

    game.nextLevel();
    expect(game.snapshot().extraLifeEarned).toBe(true);
    expect(game.lives).toBe(livesAfterBonus);

    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');
    const livesAfterDeath = game.lives; // One life taken by the lethal contact.
    expect(livesAfterDeath).toBe(livesAfterBonus - 1);

    runForMs(game, DEFAULT_CONFIG.dyingPresentationMs);
    expect(game.status).toBe('chase');
    expect(game.snapshot().extraLifeEarned).toBe(true); // Still true: the respawn grants nothing new.
    expect(game.lives).toBe(livesAfterDeath);

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
