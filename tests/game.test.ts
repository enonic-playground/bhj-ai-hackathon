import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { ballFreeGame, corridorMaze, runForMs, runSteps } from './fixtures.js';

describe('level start', () => {
  it('starts on the title screen and ignores movement there', () => {
    const game = ballFreeGame(createLevelOneMaze());
    expect(game.status).toBe('title');
    expect(game.requestDirection('left')).toBe(false);
    runForMs(game, 1000);
    expect(game.player).toMatchObject({ x: game.maze.spawn.col, y: game.maze.spawn.row });
    expect(game.score).toBe(0);
  });

  it('starts a fresh level one with a full maze and no score', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    expect(game.status).toBe('chase');
    expect(game.level).toBe(1);
    expect(game.score).toBe(0);
    expect(game.dotsRemaining).toBe(game.maze.dotTiles.length);
    expect(game.player).toMatchObject({ x: 1, y: 1, direction: null });
  });
});

describe('dots and score', () => {
  it('awards 10 points once per dot and never rescores it', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    game.requestDirection('right');
    runForMs(game, 1000); // Reaches the wall at column 5, collecting four dots.

    expect(game.score).toBe(4 * DEFAULT_CONFIG.dotScore);
    expect(game.dotsRemaining).toBe(0);

    game.requestDirection('left');
    runForMs(game, 1000);
    expect(game.score).toBe(4 * DEFAULT_CONFIG.dotScore); // Cleared corridor, no new points.
    expect(game.player.x).toBeCloseTo(1, 9);
  });

  it('keeps gameplay active once the last dot is gone', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    game.requestDirection('right');
    runForMs(game, 1000);

    expect(game.dotsRemaining).toBe(0);
    expect(game.status).toBe('chase'); // No level-complete transition in M1.

    game.requestDirection('left');
    runForMs(game, 200);
    expect(game.player.x).toBeLessThan(5); // Still navigable.
  });

  it('collects a dot only when the player reaches its tile centre', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    game.requestDirection('right');
    runSteps(game, 1);
    expect(game.score).toBe(0);
    expect(game.hasDot({ col: 2, row: 1 })).toBe(true);

    runForMs(game, 1000 / DEFAULT_CONFIG.playerSpeedTilesPerSecond);
    expect(game.hasDot({ col: 2, row: 1 })).toBe(false);
    expect(game.score).toBe(DEFAULT_CONFIG.dotScore);
  });

  it('places no dot under the spawn tile of the authored map', () => {
    const game = ballFreeGame(createLevelOneMaze());
    expect(game.hasDot(game.maze.spawn)).toBe(false);
  });
});

describe('input state', () => {
  it('drops a queued direction when input is cleared', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    game.requestDirection('up'); // Illegal here, so it stays queued.
    expect(game.player.pendingDirection).toBe('up');
    game.clearInput();
    expect(game.player.pendingDirection).toBeNull();
  });

  it('clears queued input when returning to the title screen', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    game.requestDirection('up');
    game.returnToTitle();
    expect(game.status).toBe('title');
    expect(game.player.pendingDirection).toBeNull();
  });

  it('resets the maze and score when a level is restarted', () => {
    const game = ballFreeGame(corridorMaze());
    game.startLevel();
    game.requestDirection('right');
    runForMs(game, 1000);
    expect(game.score).toBeGreaterThan(0);

    game.startLevel();
    expect(game.score).toBe(0);
    expect(game.dotsRemaining).toBe(game.maze.dotTiles.length);
    expect(game.player).toMatchObject({ x: 1, y: 1, direction: null, pendingDirection: null });
  });
});

describe('authored map simulation', () => {
  it('lets the player cross the side tunnel without leaving the grid', () => {
    const game = ballFreeGame(createLevelOneMaze());
    game.startLevel();
    const tunnelRow = game.maze.tunnelRows[0] as number;

    // Left to the end of the spawn corridor, then up with a queued left turn
    // that only becomes legal on the tunnel row.
    game.requestDirection('left');
    runForMs(game, 600);
    game.requestDirection('up');
    runForMs(game, 200);
    game.requestDirection('left');
    runForMs(game, 4000);

    expect(game.player.y).toBe(tunnelRow);
    expect(game.player.x).toBeGreaterThanOrEqual(0);
    expect(game.player.x).toBeLessThan(game.maze.width);
    expect(game.player.x).toBeGreaterThan(game.maze.width / 2); // Wrapped to the right side.
    expect(game.score).toBeGreaterThan(0);
  });
});
