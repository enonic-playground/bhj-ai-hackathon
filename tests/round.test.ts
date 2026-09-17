import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import type { Game } from '../src/game/game.js';
import { createMaze } from '../src/game/maze.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { createSeededRandom } from '../src/game/random.js';
import { ALPHABET, fixedWord } from '../src/game/words.js';
import { ballAt, corridorMaze, createTestGame, runForMs, runUntil } from './fixtures.js';

const { letterScore, wordBonusScore, resumeCountdownMs, dotScore } = DEFAULT_CONFIG;

/** Ten dots in one straight corridor: long enough to sweep between captures. */
const SWEEP_MAZE = ['############', '#P.........#', '############'];

/** A round on the small corridor, with the ball placed at the far end. */
function cornered(): Game {
  return createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
}

/** Starts a round and plays until the ball is caught. */
function caught(game: Game = cornered()): Game {
  game.startLevel();
  game.requestDirection('right');
  runUntil(game, () => game.status === 'guess', 5000);
  return game;
}

describe('capture and freeze', () => {
  it('freezes the maze, the actors and the collectibles while guessing', () => {
    const game = caught();
    const frozen = game.snapshot();
    expect(frozen.status).toBe('guess');
    expect(frozen.ball).toBeNull();
    expect(frozen.player.pendingDirection).toBeNull(); // Queued input dropped.
    expect(frozen.player.direction).toBe('right'); // Kept for the resumption.

    runForMs(game, 10_000);
    const later = game.snapshot();
    expect(later).toEqual(frozen);
    expect(game.activeTimeMs).toBe(frozen ? game.activeTimeMs : 0);
  });

  it('ignores movement requests while guessing', () => {
    const game = caught();
    expect(game.requestDirection('left')).toBe(false);
    expect(game.player.pendingDirection).toBeNull();
    runForMs(game, 500);
    expect(game.status).toBe('guess');
  });
});

describe('letter guesses', () => {
  it('reveals every occurrence and scores each new position', () => {
    const game = caught();
    const dotsScore = game.score;

    const result = game.guess('p');
    expect(result.outcome).toBe('correct');
    expect(result.revealed).toBe(2);
    expect(game.score).toBe(dotsScore + 2 * letterScore);
    expect(game.snapshot().word.mask).toEqual([null, 'P', 'P', null, null]);
    expect(game.status).toBe('guess'); // Guessing continues after a hit.
  });

  it('ignores a duplicate guess entirely', () => {
    const game = caught();
    game.guess('A');
    const afterFirst = game.snapshot();

    for (const duplicate of ['A', 'a']) {
      expect(game.guess(duplicate).outcome).toBe('duplicate');
    }
    expect(game.snapshot()).toEqual(afterFirst);
  });

  it('ignores input that is not a single letter', () => {
    const game = caught();
    const before = game.snapshot();
    for (const input of ['', '1', 'ab', ' ', 'Enter', '-']) {
      expect(game.guess(input).outcome).toBe('invalid');
    }
    expect(game.snapshot()).toEqual(before);
  });

  it('accepts no guesses outside guessing', () => {
    const game = cornered();
    expect(game.guess('A').outcome).toBe('ignored'); // Title screen.
    game.startLevel();
    expect(game.guess('A').outcome).toBe('ignored'); // Chase.
    expect(game.snapshot().word.revealedLetters).toEqual([]);
    expect(game.score).toBe(0);
  });
});

describe('wrong letter and the resume countdown', () => {
  it('records the miss, respawns one ball and freezes until the countdown ends', () => {
    const game = caught();
    const beforeMiss = game.snapshot();

    const result = game.guess('Z');
    expect(result.outcome).toBe('wrong');
    expect(game.status).toBe('resuming');
    expect(game.score).toBe(beforeMiss.score); // No penalty of any kind.
    expect(game.snapshot().word.wrongLetters).toEqual(['Z']);
    expect(game.ball).not.toBeNull();
    expect(game.resumeRemainingMs).toBe(resumeCountdownMs);

    // Only the countdown advances: player, ball and dots are untouched.
    const duringCountdown = game.snapshot();
    runForMs(game, resumeCountdownMs / 2);
    const halfway = game.snapshot();
    expect(halfway.status).toBe('resuming');
    expect(halfway.player).toEqual(duringCountdown.player);
    expect(halfway.ball).toEqual(duringCountdown.ball);
    expect(halfway.dotsRemaining).toBe(duringCountdown.dotsRemaining);
    expect(halfway.resumeRemainingMs).toBeLessThan(duringCountdown.resumeRemainingMs);

    runForMs(game, resumeCountdownMs / 2);
    expect(game.status).toBe('chase');
    expect(game.resumeRemainingMs).toBe(0);
    expect(game.snapshot().player.x).toBe(duringCountdown.player.x);
    expect(game.snapshot().word.mask).toEqual(beforeMiss.word.mask);
  });

  it('ends the countdown once, however large the step', () => {
    const game = caught();
    game.guess('Z');
    game.step(60); // A minute-long frame.
    expect(game.status).toBe('chase');
    expect(game.resumeRemainingMs).toBe(0);
  });

  it('ignores movement and further guesses during the countdown', () => {
    const game = caught();
    game.guess('Z');
    const during = game.snapshot();

    expect(game.requestDirection('left')).toBe(false);
    expect(game.guess('A').outcome).toBe('ignored');
    expect(game.snapshot().player).toEqual(during.player);
    expect(game.snapshot().word).toEqual(during.word);
  });

  it('clears queued input again when the countdown ends', () => {
    const game = caught();
    game.guess('Z');
    game.player.pendingDirection = 'up'; // As a held key would leave it.
    runForMs(game, resumeCountdownMs);
    expect(game.status).toBe('chase');
    expect(game.player.pendingDirection).toBeNull();
  });

  it('respawns exactly one ball however often the miss is repeated', () => {
    const game = caught();
    game.guess('Z');
    const spawned = game.snapshot().ball;

    for (let repeat = 0; repeat < 5; repeat += 1) {
      expect(game.guess('Z').outcome).toBe('ignored');
    }
    expect(game.snapshot().ball).toEqual(spawned);
    expect(game.snapshot().word.wrongLetters).toEqual(['Z']);
  });

  it('keeps the same word across chases and can be caught again', () => {
    const game = caught();
    game.guess('A');
    const revealed = game.snapshot().word;
    game.guess('Z');
    runForMs(game, resumeCountdownMs);

    expect(game.status).toBe('chase');
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 8000);

    const second = game.snapshot();
    expect(second.status).toBe('guess');
    expect(second.word.mask).toEqual(revealed.mask);
    expect(second.word.category).toBe(revealed.category);
    expect(second.word.wrongLetters).toEqual(['Z']);
  });
});

describe('round completion', () => {
  function solve(game: Game): void {
    for (const letter of ['A', 'P', 'L', 'E']) {
      game.guess(letter);
    }
  }

  it('awards the word bonus exactly once and reveals the word', () => {
    const game = caught();
    const dotsScore = game.score;
    solve(game);

    expect(game.status).toBe('level-complete');
    const solved = game.snapshot();
    expect(solved.word.solved).toBe(true);
    expect(solved.word.answer).toBe('APPLE');
    expect(solved.word.mask).toEqual(['A', 'P', 'P', 'L', 'E']);
    // Four correct letters cover five positions, plus the one-off word bonus.
    expect(game.score).toBe(dotsScore + 5 * letterScore + wordBonusScore);

    for (const repeat of ['E', 'A', 'Q']) {
      expect(game.guess(repeat).outcome).toBe('ignored');
    }
    runForMs(game, 5000);
    expect(game.snapshot()).toEqual(solved);
  });

  it('hides the answer until the round is over', () => {
    const game = caught();
    expect(game.snapshot().word.answer).toBeNull();
    game.guess('A');
    expect(game.snapshot().word.answer).toBeNull();
    solve(game);
    expect(game.snapshot().word.answer).toBe('APPLE');
  });

  it('starts a clean round on play again', () => {
    const game = caught();
    solve(game);
    expect(game.score).toBeGreaterThan(0);

    game.startLevel();
    const fresh = game.snapshot();
    expect(fresh.status).toBe('chase');
    expect(fresh.score).toBe(0);
    expect(fresh.level).toBe(1);
    expect(fresh.dotsRemaining).toBe(game.maze.dotTiles.length);
    expect(fresh.word.mask.every((letter) => letter === null)).toBe(true);
    expect(fresh.word.revealedLetters).toEqual([]);
    expect(fresh.word.wrongLetters).toEqual([]);
    expect(fresh.player).toEqual({
      x: game.maze.spawn.col,
      y: game.maze.spawn.row,
      direction: null,
      pendingDirection: null,
    });
    expect(fresh.ball).not.toBeNull();
  });

  it('returns to the title screen and drops the ball', () => {
    const game = caught();
    solve(game);
    game.returnToTitle();
    expect(game.status).toBe('title');
    expect(game.ball).toBeNull();
  });

  it('never completes a round by clearing the dots alone', () => {
    // A longer corridor, so a sweep makes progress between captures, and the
    // real spawn rule rather than a pinned tile.
    const game = createTestGame(createMaze(SWEEP_MAZE));
    game.startLevel();
    expect(game.dotsRemaining).toBeGreaterThan(0);

    // Sweep the corridor until every dot is gone, missing a new letter each
    // time the ball is caught so the round always returns to the chase.
    const misses = ALPHABET.filter((letter) => !'APPLE'.includes(letter));
    let missIndex = 0;
    const missAndResume = (): void => {
      expect(game.guess(misses[missIndex++] as string).outcome).toBe('wrong');
      runForMs(game, resumeCountdownMs);
    };

    let direction: 'left' | 'right' = 'right';
    let previousX = Number.NaN;
    for (let pass = 0; pass < misses.length && game.dotsRemaining > 0; pass += 1) {
      if (game.status === 'guess') {
        missAndResume();
      }
      game.requestDirection(direction);
      runForMs(game, 1000);
      // Turn round only once the corridor end stops the player.
      const { x } = game.snapshot().player;
      if (Math.abs(x - previousX) < 0.01) {
        direction = direction === 'right' ? 'left' : 'right';
      }
      previousX = x;
    }

    expect(game.dotsRemaining).toBe(0);
    expect(game.status).not.toBe('level-complete');
    expect(game.snapshot().word.solved).toBe(false);
    expect(game.score % dotScore).toBe(0); // Dots only: a miss scores nothing.

    // With no dots left the ball still spawns and can still be caught.
    if (game.status === 'guess') {
      missAndResume();
    }
    expect(game.ball).not.toBeNull();
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 10_000);
    expect(game.status).toBe('guess');
  });
});

describe('a full round on the authored maze', () => {
  it('plays catch, miss, catch and solve with the real spawn rules', () => {
    const game = createTestGame(createLevelOneMaze(), {
      random: createSeededRandom(2026),
      selectWord: fixedWord('APPLE', 'Fruit'),
    });
    game.startLevel();
    expect(game.ball).not.toBeNull();

    // Chase with a simple pursuit: turn toward the ball at every junction.
    const chaseUntilCaught = (): void => {
      runUntil(
        game,
        () => {
          const state = game.snapshot();
          if (state.status !== 'chase' || !state.ball) return true;
          const dx = state.ball.x - state.player.x;
          const dy = state.ball.y - state.player.y;
          game.requestDirection(
            Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up',
          );
          return false;
        },
        120_000,
      );
    };

    chaseUntilCaught();
    expect(game.status).toBe('guess');

    expect(game.guess('A').outcome).toBe('correct');
    expect(game.guess('Q').outcome).toBe('wrong');
    expect(game.status).toBe('resuming');
    runForMs(game, resumeCountdownMs);
    expect(game.status).toBe('chase');

    chaseUntilCaught();
    expect(game.status).toBe('guess');
    expect(game.guess('P').outcome).toBe('correct');
    expect(game.guess('L').outcome).toBe('correct');
    expect(game.guess('E').outcome).toBe('solved');

    expect(game.status).toBe('level-complete');
    expect(game.snapshot().word.answer).toBe('APPLE');
    expect(game.score).toBeGreaterThanOrEqual(5 * letterScore + wordBonusScore);
  });
});
