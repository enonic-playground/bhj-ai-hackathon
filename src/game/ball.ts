import { advanceActor, createActor, type Actor } from './actor.js';
import { DIRECTIONS, oppositeDirection, type Direction } from './direction.js';
import { neighbor, type GridPosition, type Maze } from './maze.js';
import { pickRandom, type RandomSource } from './random.js';

/**
 * The ball is an ordinary actor driven by a policy instead of player input, so
 * it obeys exactly the same walls, corridors and tunnel rules. It never enters
 * the enemy home, because `neighbor` only returns player-walkable tiles.
 */
export function createBall(spawn: GridPosition): Actor {
  return createActor(spawn);
}

/** Every direction that leads out of `tile` along a legal edge. */
export function legalExits(maze: Maze, tile: GridPosition): Direction[] {
  return DIRECTIONS.filter((direction) => neighbor(maze, tile, direction) !== null);
}

/**
 * Ball policy, applied at every tile centre: choose uniformly at random among
 * the legal exits, excluding an immediate reversal whenever another exit
 * exists. In a corridor that leaves only "straight on", so the ball rolls
 * through; at a junction it may turn; at a dead end the reversal is the only
 * exit and the ball turns around instead of stopping. A walled-in tile with no
 * exit at all returns null, which stops the ball rather than looping.
 */
export function chooseBallDirection(
  maze: Maze,
  tile: GridPosition,
  current: Direction | null,
  random: RandomSource,
): Direction | null {
  const exits = legalExits(maze, tile);
  if (exits.length === 0) {
    return null;
  }
  const forward = current ? exits.filter((exit) => exit !== oppositeDirection(current)) : exits;
  return pickRandom(forward.length > 0 ? forward : exits, random);
}

/** Moves the ball `distance` tiles, deciding its direction at each tile centre. */
export function advanceBall(
  maze: Maze,
  ball: Actor,
  distance: number,
  random: RandomSource,
): void {
  advanceActor(maze, ball, distance, (tile, actor) =>
    chooseBallDirection(maze, tile, actor.direction, random),
  );
}

/**
 * Centre-to-centre distance between two actors, in tiles. The horizontal seam
 * is only measured the short way round when both actors are on a tunnel row,
 * so two actors near opposite walls of an ordinary row are correctly treated as
 * far apart rather than adjacent.
 */
export function actorSeparation(maze: Maze, a: Actor, b: Actor): number {
  const dy = a.y - b.y;
  const directDx = Math.abs(a.x - b.x);
  const onTunnelRow =
    maze.tunnelRows.includes(Math.round(a.y)) && maze.tunnelRows.includes(Math.round(b.y));
  const dx = onTunnelRow ? Math.min(directDx, maze.width - directDx) : directDx;
  return Math.hypot(dx, dy);
}

/** True when the player is close enough to catch the ball. */
export function isCaptured(maze: Maze, player: Actor, ball: Actor, radiusTiles: number): boolean {
  return actorSeparation(maze, player, ball) <= radiusTiles;
}
