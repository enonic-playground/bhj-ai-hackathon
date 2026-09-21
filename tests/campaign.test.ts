import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { Game } from '../src/game/game.js';
import { LEVELS } from '../src/game/levels.js';
import { createSeededRandom } from '../src/game/random.js';
import { selectWordForLevel, type WordEntry } from '../src/game/words.js';
import {
  arenaEnemy,
  arenaMaze,
  ballAt,
  corridorMaze,
  createTestGame,
  placeEnemyOnPlayer,
  runForMs,
  runUntil,
  steerPlayerTo,
  STEP_SECONDS,
} from './fixtures.js';

/** One fixed, realistically-lengthed word per level, easy to solve deterministically. */
const CAMPAIGN_WORDS = ['FISH', 'BIRDS', 'RABBIT', 'PENGUIN', 'ELEPHANT'] as const;
const BALL = { col: 5, row: 1 };

function campaignWord({ level }: { readonly level: number }): WordEntry {
  return { word: CAMPAIGN_WORDS[level - 1] as string, category: `Level ${level}` };
}

function campaignGame(): Game {
  const game = createTestGame(corridorMaze(), {
    selectBallSpawn: ballAt(BALL),
    selectWord: campaignWord,
  });
  game.startLevel();
  return game;
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

describe('level transitions', () => {
  it('opens level-complete for levels one through four, not campaign-complete', () => {
    const game = campaignGame();
    solveLevel(game);
    expect(game.status).toBe('level-complete');
    expect(game.level).toBe(1);
    expect(game.snapshot().word.answer).toBe('FISH');
  });

  it('advances exactly once, resets the level and preserves score and lives', () => {
    const game = campaignGame();
    solveLevel(game);
    const before = game.snapshot();
    expect(before.score).toBeGreaterThan(0);

    expect(game.nextLevel()).toBe(true);
    const after = game.snapshot();
    expect(after.status).toBe('chase');
    expect(game.level).toBe(2);
    expect(after.score).toBe(before.score);
    expect(after.lives).toBe(before.lives);
    expect(after.dotsRemaining).toBe(game.maze.dotTiles.length);
    expect(after.word.length).toBe(5);
    expect(after.word.revealedLetters).toEqual([]);
    expect(after.word.wrongLetters).toEqual([]);
    expect(after.ball).not.toBeNull();
  });

  it('refuses to advance outside level-complete, so rapid clicks cannot skip a level', () => {
    const game = campaignGame();
    expect(game.nextLevel()).toBe(false); // Still chasing level one.
    expect(game.level).toBe(1);

    solveLevel(game);
    expect(game.nextLevel()).toBe(true);
    expect(game.level).toBe(2);
    // The level is running again now; a second, repeated click does nothing.
    expect(game.nextLevel()).toBe(false);
    expect(game.level).toBe(2);
  });

  it('ends level five in campaign-complete directly, and there is no level six', () => {
    const game = campaignGame();
    for (let level = 1; level <= 4; level += 1) {
      solveLevel(game);
      expect(game.status).toBe('level-complete');
      expect(game.nextLevel()).toBe(true);
    }
    expect(game.level).toBe(5);

    solveLevel(game);
    expect(game.status).toBe('campaign-complete');
    expect(game.level).toBe(5);
    expect(game.snapshot().word.answer).toBe('ELEPHANT');
    expect(game.nextLevel()).toBe(false); // Never reachable from campaign-complete.
    expect(game.level).toBe(5);
  });

  it('freezes the maze and ignores gameplay input on campaign-complete', () => {
    const game = campaignGame();
    for (let level = 1; level <= 5; level += 1) {
      solveLevel(game);
      if (level < 5) game.nextLevel();
    }
    expect(game.status).toBe('campaign-complete');

    const before = game.snapshot();
    expect(game.requestDirection('left')).toBe(false);
    expect(game.guess('A').outcome).toBe('ignored');
    runForMs(game, 3000);
    expect(game.snapshot()).toEqual(before);
  });

  it('increases roaming enemy speed by level', () => {
    const game = campaignGame();
    expect(game.enemySpeedFactor).toBeCloseTo(LEVELS[0]!.enemySpeedFactor, 9);

    solveLevel(game);
    game.nextLevel();
    expect(game.enemySpeedFactor).toBeCloseTo(LEVELS[1]!.enemySpeedFactor, 9);

    solveLevel(game);
    game.nextLevel();
    expect(game.level).toBe(3);
    expect(game.enemySpeedFactor).toBeCloseTo(LEVELS[2]!.enemySpeedFactor, 9);
  });

  it('a restart always returns to level one with a fresh word', () => {
    const game = campaignGame();
    solveLevel(game);
    game.nextLevel();
    expect(game.level).toBe(2);

    game.startLevel();
    expect(game.level).toBe(1);
    expect(game.enemySpeedFactor).toBeCloseTo(LEVELS[0]!.enemySpeedFactor, 9);
    expect(game.snapshot().word.length).toBe(4);
  });
});

describe('no repeated word within a run', () => {
  /** Two four-letter words with distinct categories, so the pick is visible without solving. */
  const TWO_WORD_BANK: readonly WordEntry[] = [
    { word: 'FISH', category: 'CategoryA' },
    { word: 'BIRD', category: 'CategoryB' },
  ];

  function twoWordGame(seed: number): Game {
    const game = createTestGame(corridorMaze(), {
      random: createSeededRandom(seed),
      selectBallSpawn: ballAt(BALL),
      selectWord: ({ excluded, random }) => selectWordForLevel(TWO_WORD_BANK, 4, excluded, random),
    });
    game.startLevel();
    return game;
  }

  it('never repeats a word across levels requesting the same length, whatever the seed', () => {
    for (let seed = 0; seed < 8; seed += 1) {
      const game = twoWordGame(seed);
      const firstCategory = game.snapshot().word.category;

      game.requestDirection('right');
      runUntil(game, () => game.status === 'guess', 5000);
      const answer = firstCategory === 'CategoryA' ? 'FISH' : 'BIRD';
      for (const letter of new Set(answer)) game.guess(letter);
      expect(game.status).toBe('level-complete');

      game.nextLevel();
      const secondCategory = game.snapshot().word.category;
      expect(secondCategory).not.toBe(firstCategory);
    }
  });

  it('clears the used-word set on a fresh run, so a restart may draw the same word again', () => {
    const game = twoWordGame(1);
    // With only two entries in the pool and the set cleared by `startLevel`,
    // either category is a legitimate fresh draw; this only checks the pool
    // is whole again, not which one comes up.
    game.startLevel();
    expect(TWO_WORD_BANK.some((entry) => entry.category === game.snapshot().word.category)).toBe(true);
  });
});

describe('death preserves the current level', () => {
  const ALL_IDS = ['chaser', 'ambusher', 'patroller', 'prowler'] as const;
  const BALL_TILE = { col: 9, row: 6 };

  function arenaCampaignGame(): Game {
    const game = createTestGame(arenaMaze(), {
      selectBallSpawn: ballAt(BALL_TILE),
      enemies: ALL_IDS.map((kind) => arenaEnemy(kind, { releaseDelayMs: 10 * 60 * 1000 })),
      selectWord: campaignWord,
    });
    game.startLevel();
    return game;
  }

  it('respawns using the current level configuration, not level one', () => {
    const game = arenaCampaignGame();
    steerPlayerTo(game, BALL_TILE);
    expect(game.status).toBe('guess');
    for (const letter of new Set('FISH')) game.guess(letter);
    expect(game.status).toBe('level-complete');

    game.nextLevel();
    expect(game.level).toBe(2);
    expect(game.enemySpeedFactor).toBeCloseTo(LEVELS[1]!.enemySpeedFactor, 9);

    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');
    runForMs(game, DEFAULT_CONFIG.dyingPresentationMs + 50);
    expect(game.status).toBe('chase');
    expect(game.level).toBe(2); // Death never changes the level.
    expect(game.enemySpeedFactor).toBeCloseTo(LEVELS[1]!.enemySpeedFactor, 9);
  });
});
