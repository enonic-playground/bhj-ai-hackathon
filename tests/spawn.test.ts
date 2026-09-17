import { describe, expect, it } from 'vitest';
import { createActor } from '../src/game/actor.js';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { createMaze, isPlayerWalkable, positionKey, tileAt } from '../src/game/maze.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { createSeededRandom } from '../src/game/random.js';
import { chooseBallSpawn, occupiedTiles, pathDistances } from '../src/game/spawn.js';
import { corridorMaze, ringMaze } from './fixtures.js';

/** Row with tunnel endpoints, where the seam is the short way round. */
const SEAM_MAZE = ['#########', 'T.P.....T', '#########'];

/** Two tiles only: a player between them leaves nowhere legal to spawn. */
const PAIR_MAZE = ['####', '#P.#', '####'];

const MIN = DEFAULT_CONFIG.minBallSpawnDistanceTiles;

describe('path distances', () => {
  it('measures legal moves only and reaches every corridor', () => {
    const maze = createLevelOneMaze();
    const distances = pathDistances(maze, maze.spawn);
    expect(distances.get(positionKey(maze.spawn))).toBe(0);

    for (let row = 0; row < maze.height; row += 1) {
      for (let col = 0; col < maze.width; col += 1) {
        const walkable = isPlayerWalkable(tileAt(maze, col, row));
        expect(distances.has(positionKey({ col, row }))).toBe(walkable);
      }
    }
  });

  it('counts a tunnel crossing as one ordinary move', () => {
    const maze = createMaze(SEAM_MAZE);
    const distances = pathDistances(maze, { col: 2, row: 1 });
    // Left mouth at column 0 is two tiles away, and the seam leads straight to
    // column 8: three, rather than the six tiles the long way round.
    expect(distances.get(positionKey({ col: 8, row: 1 }))).toBe(3);
    expect(distances.get(positionKey({ col: 7, row: 1 }))).toBe(4);
  });
});

describe('occupied tiles', () => {
  it('is the single tile under an actor at a centre', () => {
    const maze = corridorMaze();
    expect(occupiedTiles(maze, createActor({ col: 3, row: 1 }))).toEqual([{ col: 3, row: 1 }]);
  });

  it('is both endpoints while an actor crosses between centres', () => {
    const maze = corridorMaze();
    const actor = { ...createActor({ col: 3, row: 1 }), x: 3.4 };
    expect(occupiedTiles(maze, actor)).toEqual([
      { col: 3, row: 1 },
      { col: 4, row: 1 },
    ]);
  });

  it('wraps a partly crossed tunnel seam back into the grid', () => {
    const maze = createMaze(SEAM_MAZE);
    const actor = { ...createActor({ col: 0, row: 1 }), x: 8.5 };
    expect(occupiedTiles(maze, actor)).toEqual([
      { col: 8, row: 1 },
      { col: 0, row: 1 },
    ]);
  });
});

describe('ball spawn selection', () => {
  it('keeps at least six legal tiles between the player and the ball', () => {
    const maze = createLevelOneMaze();
    const player = createActor(maze.spawn);

    for (let seed = 0; seed < 60; seed += 1) {
      const spawn = chooseBallSpawn(maze, player, {
        random: createSeededRandom(seed),
        minDistanceTiles: MIN,
      });
      expect(spawn).not.toBeNull();
      const distances = pathDistances(maze, maze.spawn);
      expect(distances.get(positionKey(spawn!))).toBeGreaterThanOrEqual(MIN);
      expect(isPlayerWalkable(tileAt(maze, spawn!.col, spawn!.row))).toBe(true);
    }
  });

  it('never spawns on the player, at a centre or between two centres', () => {
    const maze = ringMaze();
    for (let seed = 0; seed < 40; seed += 1) {
      const midSegment = { ...createActor({ col: 1, row: 4 }), y: 3.5 };
      const spawn = chooseBallSpawn(maze, midSegment, {
        random: createSeededRandom(seed),
        minDistanceTiles: MIN,
      });
      expect(spawn).not.toBeNull();
      // Both endpoints of the segment the player is crossing are excluded.
      expect(spawn).not.toEqual({ col: 1, row: 3 });
      expect(spawn).not.toEqual({ col: 1, row: 4 });
    }
  });

  it('measures distance from the tile centre the player is nearest to', () => {
    const maze = ringMaze();
    // Between rows 3 and 4, closer to row 4: row 4 is the documented anchor.
    const betweenCentres = { ...createActor({ col: 1, row: 4 }), y: 3.6 };
    const fromAnchor = pathDistances(maze, { col: 1, row: 4 });
    const fromOtherEndpoint = pathDistances(maze, { col: 1, row: 3 });

    for (let seed = 0; seed < 20; seed += 1) {
      const spawn = chooseBallSpawn(maze, betweenCentres, {
        random: createSeededRandom(seed),
        minDistanceTiles: MIN,
      });
      expect(spawn).not.toBeNull();
      expect(fromAnchor.get(positionKey(spawn!))).toBeGreaterThanOrEqual(MIN);
    }
    // The two endpoints really do measure differently, so the anchor matters.
    expect(fromOtherEndpoint.get(positionKey({ col: 6, row: 1 }))).not.toBe(
      fromAnchor.get(positionKey({ col: 6, row: 1 })),
    );
  });

  it('falls back to the farthest reachable tile, randomizing ties', () => {
    const maze = corridorMaze(); // Five tiles: nothing is six tiles away.
    const player = createActor(maze.spawn);
    const spawn = chooseBallSpawn(maze, player, {
      random: createSeededRandom(3),
      minDistanceTiles: MIN,
    });
    expect(spawn).toEqual({ col: 5, row: 1 });

    // In the seam maze two tiles tie for farthest, and both are chosen.
    const seamMaze = createMaze(SEAM_MAZE);
    const chosen = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      const fallback = chooseBallSpawn(seamMaze, createActor({ col: 2, row: 1 }), {
        random: createSeededRandom(seed),
        minDistanceTiles: MIN,
      });
      chosen.add(positionKey(fallback!));
    }
    expect([...chosen].sort()).toEqual(['6,1', '7,1']);
  });

  it('returns no spawn, rather than looping, when every tile is occupied', () => {
    const maze = createMaze(PAIR_MAZE);
    const between = { ...createActor({ col: 1, row: 1 }), x: 1.5 };
    expect(
      chooseBallSpawn(maze, between, { random: createSeededRandom(1), minDistanceTiles: MIN }),
    ).toBeNull();
  });
});
