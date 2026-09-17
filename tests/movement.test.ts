import { describe, expect, it } from 'vitest';
import { advanceActor, createActor, type Actor } from '../src/game/actor.js';
import type { Maze } from '../src/game/maze.js';
import { corridorMaze, junctionMaze, tunnelMaze } from './fixtures.js';

function actorAt(col: number, row: number, direction: Actor['direction'] = null): Actor {
  return { x: col, y: row, direction, pendingDirection: null };
}

/** Moves in small increments so a test never depends on one large step. */
function travel(maze: Maze, actor: Actor, distance: number, increment = 0.05): void {
  let moved = 0;
  while (moved < distance - 1e-9) {
    const step = Math.min(increment, distance - moved);
    advanceActor(maze, actor, step);
    moved += step;
  }
}

describe('wall handling', () => {
  it('stops at a wall instead of crossing it', () => {
    const maze = corridorMaze();
    const actor = actorAt(1, 1);
    actor.pendingDirection = 'right';
    travel(maze, actor, 20);
    expect(actor.x).toBeCloseTo(5, 9); // Last corridor column; column 6 is wall.
    expect(actor.y).toBe(1);
  });

  it('cannot pass through a wall even with one very long step', () => {
    const maze = corridorMaze();
    const actor = actorAt(1, 1);
    actor.pendingDirection = 'right';
    advanceActor(maze, actor, 500);
    expect(actor.x).toBeCloseTo(5, 9);
  });

  it('ignores a direction that faces a wall and stays put', () => {
    const maze = corridorMaze();
    const actor = actorAt(1, 1);
    actor.pendingDirection = 'up';
    travel(maze, actor, 3);
    expect(actor.x).toBe(1);
    expect(actor.y).toBe(1);
    expect(actor.direction).toBeNull();
    expect(actor.pendingDirection).toBe('up'); // Kept until it becomes legal.
  });

  it('starts stationary until a direction is requested', () => {
    const maze = corridorMaze();
    const actor = createActor(maze.spawn);
    travel(maze, actor, 5);
    expect(actor).toMatchObject({ x: 1, y: 1, direction: null });
  });
});

describe('buffered turns', () => {
  it('waits for the first junction where the requested turn is legal', () => {
    const maze = junctionMaze();
    const actor = actorAt(1, 1);
    actor.pendingDirection = 'right';
    travel(maze, actor, 0.5);

    actor.pendingDirection = 'down'; // Illegal at columns 1 and 2.
    travel(maze, actor, 1.0);
    expect(actor.y).toBe(1);
    expect(actor.direction).toBe('right');
    expect(actor.pendingDirection).toBe('down');

    travel(maze, actor, 1.0); // Reaches column 3, where down opens.
    expect(actor.direction).toBe('down');
    expect(actor.x).toBe(3);
    expect(actor.y).toBeGreaterThan(1);
    expect(actor.pendingDirection).toBeNull();
  });

  it('never cuts a corner before reaching the junction centre', () => {
    const maze = junctionMaze();
    const actor = actorAt(1, 1, 'right');
    actor.pendingDirection = 'down';
    for (let i = 0; i < 60; i += 1) {
      advanceActor(maze, actor, 0.05);
      if (actor.direction === 'down') {
        expect(actor.x).toBe(3); // Turned exactly on the junction centre.
        break;
      }
      expect(actor.y).toBe(1);
    }
    expect(actor.direction).toBe('down');
  });

  it('keeps only the latest requested direction', () => {
    const maze = junctionMaze();
    const actor = actorAt(1, 1, 'right');
    actor.pendingDirection = 'up';
    actor.pendingDirection = 'down';
    expect(actor.pendingDirection).toBe('down');
    travel(maze, actor, 2.5);
    expect(actor.direction).toBe('down');
  });
});

describe('reversal', () => {
  it('reverses mid-corridor without entering a wall', () => {
    const maze = corridorMaze();
    const actor = actorAt(1, 1, 'right');
    travel(maze, actor, 2.5);
    expect(actor.x).toBeCloseTo(3.5, 9);

    actor.pendingDirection = 'left';
    advanceActor(maze, actor, 0.25);
    expect(actor.direction).toBe('left');
    expect(actor.x).toBeCloseTo(3.25, 9);

    travel(maze, actor, 10);
    expect(actor.x).toBeCloseTo(1, 9); // Stopped by the wall at column 0.
  });

  it('reverses at a tile centre as well', () => {
    const maze = corridorMaze();
    const actor = actorAt(3, 1, 'right');
    actor.pendingDirection = 'left';
    travel(maze, actor, 1);
    expect(actor.direction).toBe('left');
    expect(actor.x).toBeCloseTo(2, 9);
  });
});

describe('tunnels', () => {
  it('wraps from the left endpoint to the right side', () => {
    const maze = tunnelMaze();
    const actor = actorAt(2, 1, 'left');
    const visited: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      for (const tile of advanceActor(maze, actor, 0.05)) {
        visited.push(tile.col);
      }
      expect(actor.x).toBeGreaterThanOrEqual(0);
      expect(actor.x).toBeLessThan(maze.width);
      expect(actor.y).toBe(1);
      if (visited.length >= 4) break;
    }
    expect(visited.slice(0, 4)).toEqual([1, 0, 4, 3]);
  });

  it('wraps from the right endpoint to the left side', () => {
    const maze = tunnelMaze();
    const actor = actorAt(2, 1, 'right');
    const visited: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      for (const tile of advanceActor(maze, actor, 0.05)) {
        visited.push(tile.col);
      }
      expect(actor.x).toBeGreaterThanOrEqual(0);
      expect(actor.x).toBeLessThan(maze.width);
      if (visited.length >= 4) break;
    }
    expect(visited.slice(0, 4)).toEqual([3, 4, 0, 1]);
  });

  it('keeps the same travelled distance across the tunnel seam', () => {
    const maze = tunnelMaze();
    const actor = actorAt(0, 1, 'left');
    advanceActor(maze, actor, 0.5);
    expect(actor.x).toBeCloseTo(4.5, 9); // Half a tile past the seam, not a free tile.
  });
});
