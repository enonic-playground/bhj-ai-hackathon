import { describe, expect, it } from 'vitest';
import {
  MazeValidationError,
  createMaze,
  isPlayerWalkable,
  neighbor,
  positionKey,
  reachableFrom,
  tileAt,
  validateLayout,
} from '../src/game/maze.js';
import { LEVEL_ONE_LAYOUT, createLevelOneMaze } from '../src/game/mazeData.js';

describe('authored level one map', () => {
  const maze = createLevelOneMaze();

  it('is rectangular and uses only known tile types', () => {
    expect(validateLayout(LEVEL_ONE_LAYOUT)).toEqual([]);
    expect(maze.height).toBe(LEVEL_ONE_LAYOUT.length);
    for (const line of LEVEL_ONE_LAYOUT) {
      expect(line).toHaveLength(maze.width);
    }
    for (const row of maze.tiles) {
      for (const tile of row) {
        expect(['wall', 'corridor', 'tunnel', 'home', 'door']).toContain(tile);
      }
    }
  });

  it('has a walkable spawn and matched tunnel endpoints', () => {
    expect(isPlayerWalkable(tileAt(maze, maze.spawn.col, maze.spawn.row))).toBe(true);
    expect(maze.tunnelRows.length).toBeGreaterThan(0);
    for (const row of maze.tunnelRows) {
      expect(tileAt(maze, 0, row)).toBe('tunnel');
      expect(tileAt(maze, maze.width - 1, row)).toBe('tunnel');
    }
  });

  it('keeps every corridor and dot reachable from the spawn', () => {
    const reachable = reachableFrom(maze, maze.spawn);
    for (let row = 0; row < maze.height; row += 1) {
      for (let col = 0; col < maze.width; col += 1) {
        if (!isPlayerWalkable(tileAt(maze, col, row))) continue;
        expect(reachable.has(positionKey({ col, row }))).toBe(true);
      }
    }
    expect(maze.dotTiles.length).toBeGreaterThan(0);
    for (const dot of maze.dotTiles) {
      expect(reachable.has(positionKey(dot))).toBe(true);
      expect(isPlayerWalkable(tileAt(maze, dot.col, dot.row))).toBe(true);
    }
  });

  it('keeps the reserved enemy home unreachable and free of dots', () => {
    const reachable = reachableFrom(maze, maze.spawn);
    let homeTiles = 0;
    for (let row = 0; row < maze.height; row += 1) {
      for (let col = 0; col < maze.width; col += 1) {
        const tile = tileAt(maze, col, row);
        if (tile !== 'home' && tile !== 'door') continue;
        homeTiles += 1;
        expect(reachable.has(positionKey({ col, row }))).toBe(false);
        expect(maze.dotTiles.some((dot) => dot.col === col && dot.row === row)).toBe(false);
      }
    }
    expect(homeTiles).toBeGreaterThan(0);
  });

  it('never allows a move off the grid outside a tunnel', () => {
    for (let row = 0; row < maze.height; row += 1) {
      for (const col of [0, maze.width - 1]) {
        if (tileAt(maze, col, row) === 'tunnel') continue;
        expect(isPlayerWalkable(tileAt(maze, col, row))).toBe(false);
      }
    }
    const tunnelRow = maze.tunnelRows[0] as number;
    expect(neighbor(maze, { col: 0, row: tunnelRow }, 'left')).toEqual({
      col: maze.width - 1,
      row: tunnelRow,
    });
    expect(neighbor(maze, { col: maze.width - 1, row: tunnelRow }, 'right')).toEqual({
      col: 0,
      row: tunnelRow,
    });
  });
});

describe('layout validation', () => {
  it('rejects a non-rectangular layout', () => {
    const errors = validateLayout(['#####', '#P.#', '#####']);
    expect(errors.join(' ')).toMatch(/width/);
  });

  it('rejects unknown tile characters', () => {
    const errors = validateLayout(['#####', '#P?.#', '#####']);
    expect(errors.join(' ')).toMatch(/unknown tile character/);
  });

  it('rejects a layout without exactly one spawn', () => {
    expect(validateLayout(['#####', '#...#', '#####']).join(' ')).toMatch(/exactly one player spawn/);
    expect(validateLayout(['#####', '#PP.#', '#####']).join(' ')).toMatch(/exactly one player spawn/);
  });

  it('rejects an unreachable corridor pocket', () => {
    const errors = validateLayout([
      '#######',
      '#P....#',
      '#######',
      '#.....#',
      '#######',
    ]);
    expect(errors.join(' ')).toMatch(/unreachable from the spawn/);
  });

  it('rejects an unmatched tunnel endpoint', () => {
    const errors = validateLayout(['#####', 'T.P.#', '#####']);
    expect(errors.join(' ')).toMatch(/tunnel endpoints/);
  });

  it('rejects a walkable border that is not a tunnel', () => {
    const errors = validateLayout(['#####', '.P..#', '#####']);
    expect(errors.join(' ')).toMatch(/border tile/);
  });

  it('throws MazeValidationError when creating an invalid maze', () => {
    expect(() => createMaze(['#####', '#..#'])).toThrow(MazeValidationError);
  });
});
