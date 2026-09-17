import { describe, expect, it } from 'vitest';
import { DIRECTIONS, type Direction } from '../src/game/direction.js';
import type { Game } from '../src/game/game.js';
import {
  directionForKey,
  handleGameKey,
  handleLetterButton,
  handleMovementKey,
  handlePadDirection,
  inputModeFor,
} from '../src/input/inputRouter.js';
import { ballAt, ballFreeGame, corridorMaze, createTestGame, runForMs, runUntil } from './fixtures.js';

describe('key mapping', () => {
  it('maps arrow keys and WASD, ignoring case', () => {
    expect(directionForKey('ArrowUp')).toBe('up');
    expect(directionForKey('ArrowDown')).toBe('down');
    expect(directionForKey('ArrowLeft')).toBe('left');
    expect(directionForKey('ArrowRight')).toBe('right');
    expect(directionForKey('w')).toBe('up');
    expect(directionForKey('S')).toBe('down');
    expect(directionForKey('A')).toBe('left');
    expect(directionForKey('d')).toBe('right');
  });

  it('ignores keys the game does not own', () => {
    for (const key of ['q', 'Enter', ' ', 'Shift', 'F5', 'PageDown']) {
      expect(directionForKey(key)).toBeNull();
    }
  });
});

describe('routing', () => {
  it('does not consume movement keys on the title screen', () => {
    const game = ballFreeGame(corridorMaze());
    expect(handleMovementKey(game, 'ArrowRight')).toBe(false);
    expect(game.player.pendingDirection).toBeNull();
    runForMs(game, 500);
    expect(game.player.x).toBe(1);
  });

  it('consumes movement keys during play so the page cannot scroll', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    expect(handleMovementKey(game, 'ArrowRight')).toBe(true);
    expect(handleMovementKey(game, 'Tab')).toBe(false);
  });

  it('gives the pad and the keyboard identical results', () => {
    for (const direction of DIRECTIONS) {
      const keyboardGame = ballFreeGame(corridorMaze());
      const padGame = ballFreeGame(corridorMaze());
      keyboardGame.startLevel();
      padGame.startLevel();

      handleMovementKey(keyboardGame, keyFor(direction));
      handlePadDirection(padGame, direction);
      runForMs(keyboardGame, 800);
      runForMs(padGame, 800);

      expect(padGame.snapshot()).toEqual(keyboardGame.snapshot());
    }
  });

  it('keeps only the latest request, so no diagonal movement is possible', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    handleMovementKey(game, 'ArrowRight');
    handleMovementKey(game, 'ArrowUp'); // Illegal here; right is not resumed diagonally.
    runForMs(game, 400);
    expect(game.player.y).toBe(1);
    expect(game.player.direction).toBeNull();
    expect(game.player.x).toBe(1);
  });
});

function keyFor(direction: Direction): string {
  return { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[direction];
}

describe('mode ownership', () => {
  function chasing(): Game {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    game.startLevel();
    return game;
  }

  function guessing(): Game {
    const game = chasing();
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    return game;
  }

  it('routes each key to the active mode only', () => {
    expect(inputModeFor('title')).toBe('none');
    expect(inputModeFor('chase')).toBe('movement');
    expect(inputModeFor('guess')).toBe('letters');
    expect(inputModeFor('resuming')).toBe('none');
    expect(inputModeFor('level-complete')).toBe('none');
  });

  it('guesses with W, A, S and D while guessing, and never moves the player', () => {
    const game = guessing();
    const before = game.player.x;

    const outcome = handleGameKey(game, 'd');
    expect(outcome.kind).toBe('letter');
    expect(outcome.owned).toBe(true);
    expect(outcome.guess?.outcome).toBe('wrong'); // D is not in APPLE.
    expect(game.player.x).toBe(before);
    expect(game.player.pendingDirection).toBeNull();
    expect(game.snapshot().word.wrongLetters).toEqual(['D']);
  });

  it('gives a letter key and a letter button the same result', () => {
    const fromKey = handleGameKey(guessing(), 'a').guess;
    const fromButton = handleLetterButton(guessing(), 'A');
    expect(fromKey).toEqual(fromButton);
    expect(fromButton.outcome).toBe('correct');
  });

  it('ignores letters during the chase and movement while guessing', () => {
    const chase = chasing();
    expect(handleGameKey(chase, 'q')).toMatchObject({ owned: false, applied: false });
    expect(chase.snapshot().word.wrongLetters).toEqual([]);

    const guess = guessing();
    expect(handleGameKey(guess, 'ArrowLeft')).toMatchObject({ owned: false, applied: false });
    expect(guess.player.pendingDirection).toBeNull();
  });

  it('owns a repeated movement key without acting on it again', () => {
    const game = chasing();
    handleGameKey(game, 'ArrowRight');
    game.clearInput();

    const repeated = handleGameKey(game, 'ArrowRight', { repeat: true });
    expect(repeated.owned).toBe(true); // The page still must not scroll.
    expect(repeated.applied).toBe(false);
    expect(game.player.pendingDirection).toBeNull();
  });

  it('does not let a held letter key repeat a guess', () => {
    const game = guessing();
    const held = handleGameKey(game, 'a', { repeat: true });
    expect(held.owned).toBe(true);
    expect(held.guess).toBeNull();
    expect(game.snapshot().word.revealedLetters).toEqual([]);
  });

  it('owns nothing during the countdown or on the result screen', () => {
    const game = guessing();
    game.guess('Z');
    expect(game.status).toBe('resuming');
    for (const key of ['ArrowLeft', 'w', 'a', 'E']) {
      expect(handleGameKey(game, key)).toMatchObject({ owned: false, applied: false });
    }

    const solved = guessing();
    for (const letter of ['A', 'P', 'L', 'E']) solved.guess(letter);
    expect(solved.status).toBe('level-complete');
    for (const key of ['ArrowLeft', 'a', 'E']) {
      expect(handleGameKey(solved, key)).toMatchObject({ owned: false, applied: false });
    }
  });

  it('keeps the pad inert outside the chase', () => {
    const game = guessing();
    expect(handlePadDirection(game, 'left')).toBe(false);
    expect(game.player.pendingDirection).toBeNull();
  });
});
