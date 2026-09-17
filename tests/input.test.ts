import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game.js';
import { DIRECTIONS, type Direction } from '../src/game/direction.js';
import { directionForKey, handleMovementKey, handlePadDirection } from '../src/input/inputRouter.js';
import { corridorMaze, runForMs } from './fixtures.js';

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
    const game = new Game(corridorMaze());
    expect(handleMovementKey(game, 'ArrowRight')).toBe(false);
    expect(game.player.pendingDirection).toBeNull();
    runForMs(game, 500);
    expect(game.player.x).toBe(1);
  });

  it('consumes movement keys during play so the page cannot scroll', () => {
    const game = new Game(corridorMaze());
    game.startLevel();
    expect(handleMovementKey(game, 'ArrowRight')).toBe(true);
    expect(handleMovementKey(game, 'Tab')).toBe(false);
  });

  it('gives the pad and the keyboard identical results', () => {
    for (const direction of DIRECTIONS) {
      const keyboardGame = new Game(corridorMaze());
      const padGame = new Game(corridorMaze());
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
    const game = new Game(corridorMaze());
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
