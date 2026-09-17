import { describe, expect, it } from 'vitest';
import {
  MazeValidationError,
  createMaze,
  isPlayerWalkable,
  isWalkableFor,
  neighbor,
  positionKey,
  reachableFrom,
  tileAt,
  validateLayout,
} from '../src/game/maze.js';
import { LEVEL_ONE_LAYOUT, createLevelOneMaze } from '../src/game/mazeData.js';
import { ARENA_LAYOUT } from './fixtures.js';

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

  it('carries four reachable power pellets that replace their dots', () => {
    const reachable = reachableFrom(maze, maze.spawn);
    expect(maze.powerPelletTiles).toEqual([
      { col: 1, row: 1 },
      { col: 19, row: 1 },
      { col: 1, row: 21 },
      { col: 19, row: 21 },
    ]);
    for (const pellet of maze.powerPelletTiles) {
      expect(isPlayerWalkable(tileAt(maze, pellet.col, pellet.row))).toBe(true);
      expect(reachable.has(positionKey(pellet))).toBe(true);
      // The tile carries a pellet instead of a dot, so neither can score twice.
      expect(maze.dotTiles.some((dot) => positionKey(dot) === positionKey(pellet))).toBe(false);
    }
  });

  it('describes a home with four start slots, one door, one exit and one rest tile', () => {
    const home = maze.home;
    if (!home) throw new Error('level one must author an enemy home');

    expect(home.spawns).toHaveLength(4);
    expect(tileAt(maze, home.door.col, home.door.row)).toBe('door');
    expect(tileAt(maze, home.exit.col, home.exit.row)).toBe('corridor');
    expect(tileAt(maze, home.rest.col, home.rest.row)).toBe('home');
    for (const slot of home.spawns) {
      expect(tileAt(maze, slot.col, slot.row)).toBe('home');
    }

    // Every release and return route exists on the home graph, and the maze
    // graph reaches the corridor a released enemy arrives on.
    const insideHome = reachableFrom(maze, home.rest, 'home');
    for (const slot of [...home.spawns, home.exit, home.door]) {
      expect(insideHome.has(positionKey(slot))).toBe(true);
    }
    expect(reachableFrom(maze, maze.spawn).has(positionKey(home.exit))).toBe(true);
  });

  it('opens the door only to the home traversal, in both directions', () => {
    const home = maze.home;
    if (!home) throw new Error('level one must author an enemy home');

    expect(neighbor(maze, home.exit, 'down')).toBeNull();
    expect(neighbor(maze, home.exit, 'down', 'maze')).toBeNull();
    expect(neighbor(maze, home.exit, 'down', 'home')).toEqual(home.door);
    expect(neighbor(maze, home.door, 'down', 'home')).toEqual(home.rest);
    expect(neighbor(maze, home.rest, 'up', 'home')).toEqual(home.door);

    expect(isWalkableFor('home', 'maze')).toBe(false);
    expect(isWalkableFor('door', 'maze')).toBe(false);
    expect(isWalkableFor('home', 'home')).toBe(true);
    expect(isWalkableFor('wall', 'home')).toBe(false);
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

  it('accepts the arena fixture used by the enemy checks', () => {
    expect(validateLayout(ARENA_LAYOUT)).toEqual([]);
    const arena = createMaze([...ARENA_LAYOUT]);
    expect(arena.home?.spawns).toHaveLength(4);
    expect(arena.powerPelletTiles).toEqual([
      { col: 1, row: 1 },
      { col: 9, row: 1 },
    ]);
  });

  it('rejects a door that opens onto more than one corridor', () => {
    const errors = validateLayout([
      '#######',
      '#.....#',
      '#..=..#',
      '#..h..#',
      '#..E..#',
      '#..P..#',
      '#######',
    ]);
    expect(errors.join(' ')).toMatch(/must touch exactly one corridor/);
  });

  it('rejects an enemy home with no start slot', () => {
    const errors = validateLayout([
      '#######',
      '#.....#',
      '#.###.#',
      '#.#=#.#',
      '#.#h#.#',
      '#..P..#',
      '#######',
    ]);
    expect(errors.join(' ')).toMatch(/no enemy start slot/);
  });

  it('rejects an enemy start slot that cannot reach the door', () => {
    const errors = validateLayout([
      '###########',
      '#.........#',
      '#.........#',
      '#.###=###.#',
      '#.#EhE#E#.#', // The slot at column 7 is walled in on every side.
      '#.#######.#',
      '#....P....#',
      '###########',
    ]);
    expect(errors.join(' ')).toMatch(/cannot reach the door/);
  });

  it('throws MazeValidationError when creating an invalid maze', () => {
    expect(() => createMaze(['#####', '#..#'])).toThrow(MazeValidationError);
  });
});
