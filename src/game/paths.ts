import { DIRECTIONS } from './direction.js';
import { neighbor, positionKey, type GridPosition, type Maze, type Traversal } from './maze.js';

/**
 * Shortest path length, in tiles, from `origin` to every tile reachable with
 * legal moves under `traversal`. Tunnel links are ordinary edges, so crossing
 * the seam costs one tile like any other move.
 */
export function pathDistances(
  maze: Maze,
  origin: GridPosition,
  traversal: Traversal = 'maze',
): Map<string, number> {
  const distances = new Map<string, number>([[positionKey(origin), 0]]);
  const queue: GridPosition[] = [origin];

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head] as GridPosition;
    const distance = distances.get(positionKey(current)) as number;
    for (const direction of DIRECTIONS) {
      const next = neighbor(maze, current, direction, traversal);
      if (!next) continue;
      const key = positionKey(next);
      if (distances.has(key)) continue;
      distances.set(key, distance + 1);
      queue.push(next);
    }
  }
  return distances;
}

/** Keeps the cache bounded; a maze this size has far fewer distinct targets. */
const DEFAULT_CAPACITY = 64;

/**
 * Memoizes breadth-first distance maps by origin and traversal.
 *
 * Enemies only decide at tile centres, but four of them frequently share a
 * target — the player's tile during CHASE, or the same scatter corner — and a
 * stationary target is reused across many decisions. Caching turns those into
 * one search instead of one per enemy per decision, which is what keeps
 * pathfinding off the render path. Entries are dropped wholesale once the cache
 * is full, so memory stays bounded and the result never depends on cache state.
 */
export class DistanceCache {
  readonly #maze: Maze;
  readonly #capacity: number;
  #entries = new Map<string, Map<string, number>>();

  constructor(maze: Maze, capacity: number = DEFAULT_CAPACITY) {
    this.#maze = maze;
    this.#capacity = Math.max(1, capacity);
  }

  from(origin: GridPosition, traversal: Traversal): Map<string, number> {
    const key = `${traversal}:${positionKey(origin)}`;
    const cached = this.#entries.get(key);
    if (cached) {
      return cached;
    }
    if (this.#entries.size >= this.#capacity) {
      this.#entries = new Map();
    }
    const distances = pathDistances(this.#maze, origin, traversal);
    this.#entries.set(key, distances);
    return distances;
  }

  /** Path length between two tiles, or `Infinity` when no legal path exists. */
  between(from: GridPosition, to: GridPosition, traversal: Traversal): number {
    return this.from(to, traversal).get(positionKey(from)) ?? Number.POSITIVE_INFINITY;
  }
}
