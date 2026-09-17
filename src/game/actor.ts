import { DIRECTION_VECTORS, oppositeDirection, type Direction } from './direction.js';
import { neighbor, wrapIndex, type GridPosition, type Maze } from './maze.js';

/**
 * A moving character. `x`/`y` are continuous tile coordinates: the centre of
 * tile (col, row) is exactly (col, row). Horizontal coordinates are modular so
 * that tunnel travel stays inside the grid.
 */
export interface Actor {
  x: number;
  y: number;
  /** Direction currently travelled; `null` while the actor has never moved. */
  direction: Direction | null;
  /** Latest requested direction, kept until it becomes legal. */
  pendingDirection: Direction | null;
}

const EPSILON = 1e-9;

export function createActor(spawn: GridPosition): Actor {
  return { x: spawn.col, y: spawn.row, direction: null, pendingDirection: null };
}

export function isAtTileCentre(actor: Actor): boolean {
  return (
    Math.abs(actor.x - Math.round(actor.x)) < EPSILON &&
    Math.abs(actor.y - Math.round(actor.y)) < EPSILON
  );
}

export function actorTile(maze: Maze, actor: Actor): GridPosition {
  return {
    col: wrapIndex(Math.round(actor.x), maze.width),
    row: wrapIndex(Math.round(actor.y), maze.height),
  };
}

function distanceToNextCentre(actor: Actor, direction: Direction): number {
  const { dx, dy } = DIRECTION_VECTORS[direction];
  const coordinate = dx !== 0 ? actor.x : actor.y;
  const forward = dx !== 0 ? dx : dy;
  const fraction = coordinate - Math.floor(coordinate);
  const distance = forward > 0 ? 1 - fraction : fraction;
  return distance < EPSILON ? 1 : distance;
}

function moveBy(maze: Maze, actor: Actor, direction: Direction, distance: number): void {
  const { dx, dy } = DIRECTION_VECTORS[direction];
  actor.x = wrapFloat(actor.x + dx * distance, maze.width);
  actor.y = wrapFloat(actor.y + dy * distance, maze.height);
}

function wrapFloat(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function snapToCentre(maze: Maze, actor: Actor): void {
  actor.x = wrapIndex(Math.round(actor.x), maze.width);
  actor.y = wrapIndex(Math.round(actor.y), maze.height);
}

/**
 * Moves the actor up to `distance` tiles along its current direction, applying
 * buffered turns and stopping at walls. Movement is split at tile centres, so an
 * arbitrarily long distance can never pass through a wall. Returns every tile
 * centre reached, in order, for collectible resolution.
 */
export function advanceActor(maze: Maze, actor: Actor, distance: number): GridPosition[] {
  const centresReached: GridPosition[] = [];
  if (!(distance > 0)) {
    return centresReached;
  }

  // A reversal is legal anywhere in a corridor, not only at a tile centre.
  if (
    actor.direction &&
    actor.pendingDirection === oppositeDirection(actor.direction) &&
    !isAtTileCentre(actor)
  ) {
    actor.direction = actor.pendingDirection;
    actor.pendingDirection = null;
  }

  let remaining = distance;
  while (remaining > EPSILON) {
    if (isAtTileCentre(actor)) {
      const tile = actorTile(maze, actor);
      if (actor.pendingDirection && neighbor(maze, tile, actor.pendingDirection)) {
        actor.direction = actor.pendingDirection;
        actor.pendingDirection = null;
      }
      if (!actor.direction || !neighbor(maze, tile, actor.direction)) {
        break; // Stationary, or stopped by a wall.
      }
    }

    const direction = actor.direction as Direction;
    const toCentre = distanceToNextCentre(actor, direction);
    const step = Math.min(remaining, toCentre);
    moveBy(maze, actor, direction, step);
    remaining -= step;

    if (step >= toCentre - EPSILON) {
      snapToCentre(maze, actor);
      centresReached.push(actorTile(maze, actor));
    }
  }

  return centresReached;
}
