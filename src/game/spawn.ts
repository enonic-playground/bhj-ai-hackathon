import { actorTile, type Actor } from './actor.js';
import { positionKey, wrapIndex, type GridPosition, type Maze } from './maze.js';
import { pathDistances } from './paths.js';
import { pickRandom, type RandomSource } from './random.js';

const EPSILON = 1e-9;

/**
 * The tiles an actor currently covers: one at a tile centre, otherwise the two
 * endpoints of the segment it is crossing. A spawn on either endpoint would
 * overlap the actor within a fraction of a tile, so both are excluded.
 */
export function occupiedTiles(maze: Maze, actor: Actor): GridPosition[] {
  const centre = actorTile(maze, actor);
  const xFraction = Math.abs(actor.x - Math.round(actor.x));
  const yFraction = Math.abs(actor.y - Math.round(actor.y));

  if (xFraction < EPSILON && yFraction < EPSILON) {
    return [centre];
  }
  if (xFraction >= yFraction) {
    const row = wrapIndex(Math.round(actor.y), maze.height);
    return [
      { col: wrapIndex(Math.floor(actor.x), maze.width), row },
      { col: wrapIndex(Math.ceil(actor.x), maze.width), row },
    ];
  }
  const col = wrapIndex(Math.round(actor.x), maze.width);
  return [
    { col, row: wrapIndex(Math.floor(actor.y), maze.height) },
    { col, row: wrapIndex(Math.ceil(actor.y), maze.height) },
  ];
}

export interface BallSpawnOptions {
  readonly random: RandomSource;
  /** Shortest legal path, in tiles, a spawn must keep from the player. */
  readonly minDistanceTiles: number;
}

/**
 * Picks a ball spawn: a random reachable tile at least `minDistanceTiles` away
 * from the player along legal maze edges. Distance is measured from the tile
 * centre the player is nearest to, and both endpoints of a partly crossed
 * segment are excluded, so a spawn can never land on the player. When no tile
 * is far enough, the farthest reachable tile is used, choosing randomly among
 * ties. Returns null only when the maze offers no eligible tile at all, which
 * cannot happen in the authored level but can in a small test fixture.
 */
export function chooseBallSpawn(
  maze: Maze,
  player: Actor,
  options: BallSpawnOptions,
): GridPosition | null {
  const anchor = actorTile(maze, player);
  const distances = pathDistances(maze, anchor);
  const blocked = new Set(occupiedTiles(maze, player).map(positionKey));

  let farthest: GridPosition[] = [];
  let farthestDistance = -1;
  const eligible: GridPosition[] = [];

  for (const [key, distance] of distances) {
    const [col, row] = key.split(',').map(Number) as [number, number];
    const position: GridPosition = { col, row };
    if (blocked.has(key)) continue;

    if (distance >= options.minDistanceTiles) {
      eligible.push(position);
    }
    if (distance > farthestDistance) {
      farthestDistance = distance;
      farthest = [position];
    } else if (distance === farthestDistance) {
      farthest.push(position);
    }
  }

  // `pathDistances` only ever walks player-walkable tiles, so walls and the
  // enemy home are already excluded here.
  return pickRandom(eligible.length > 0 ? eligible : farthest, options.random);
}
