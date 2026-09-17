import { actorTile, createActor, type Actor } from './actor.js';
import type { EnemyDefinition, GameConfig } from './config.js';
import { oppositeDirection, type Direction } from './direction.js';
import {
  neighbor,
  positionKey,
  samePosition,
  type GridPosition,
  type Maze,
  type Traversal,
} from './maze.js';
import type { DistanceCache } from './paths.js';
import { pickRandom, type RandomSource } from './random.js';

/**
 * Where an enemy is in its lifecycle.
 *
 * - `home`: parked on its start slot, counting down to its release.
 * - `exiting`: travelling from inside the home to the corridor outside the door.
 * - `roaming`: in the maze under its own targeting policy.
 * - `returning`: eaten, travelling back to the tile inside the door.
 * - `resting`: waiting inside the home after a return, before exiting again.
 *
 * Only `roaming` can touch the player at all: an enemy that is waiting,
 * leaving or going home is neither lethal nor edible.
 */
export type EnemyState = 'home' | 'exiting' | 'roaming' | 'returning' | 'resting';

export type EnemyPhase = 'scatter' | 'chase';

export interface Enemy {
  readonly definition: EnemyDefinition;
  readonly actor: Actor;
  state: EnemyState;
  /** Remaining release delay, or remaining post-return wait, in milliseconds. */
  waitRemainingMs: number;
  /** Index of the patrol waypoint currently being headed for. */
  waypointIndex: number;
  /**
   * Set by a documented mode transition (a chase/scatter flip, the start of a
   * frightened effect, or being eaten) and consumed at the next tile centre,
   * which is the only place an enemy ever changes direction.
   */
  reverseRequested: boolean;
}

/**
 * Tie-breaking order for enemy turns: up, then left, then down, then right.
 * Two candidate turns with the same path distance always resolve the same way,
 * so a fixture replays exactly.
 */
export const TURN_ORDER: readonly Direction[] = ['up', 'left', 'down', 'right'];

/** Places one enemy on its start slot, ready for its release delay to run. */
export function createEnemy(definition: EnemyDefinition, slot: GridPosition): Enemy {
  return {
    definition,
    actor: createActor(slot),
    state: 'home',
    waitRemainingMs: definition.releaseDelayMs,
    waypointIndex: 0,
    reverseRequested: false,
  };
}

/** Which graph this enemy's state is allowed to move on. */
export function traversalFor(state: EnemyState): Traversal {
  return state === 'exiting' || state === 'returning' ? 'home' : 'maze';
}

/** True while this enemy can be eaten by the player. */
export function isEdible(enemy: Enemy, frightenedRemainingMs: number): boolean {
  return enemy.state === 'roaming' && frightenedRemainingMs > 0;
}

/** True while contact with this enemy costs the player a life. */
export function isLethal(enemy: Enemy, frightenedRemainingMs: number): boolean {
  return enemy.state === 'roaming' && frightenedRemainingMs <= 0;
}

/** Speed of this enemy, as a fraction of the player's. */
export function speedFactorFor(
  enemy: Enemy,
  frightenedRemainingMs: number,
  config: GameConfig,
): number {
  if (enemy.state === 'returning') {
    return config.returningSpeedFactor;
  }
  if (isEdible(enemy, frightenedRemainingMs)) {
    return config.frightenedSpeedFactor;
  }
  return config.enemySpeedFactor;
}

/**
 * The tile up to `lead` legal steps ahead of the player along its direction,
 * stopping at the last legal tile before a blocked step. A player that has
 * never moved has no direction, so its own tile is the target.
 */
export function leadTile(maze: Maze, player: Actor, lead: number): GridPosition {
  let tile = actorTile(maze, player);
  const direction = player.direction;
  if (!direction) {
    return tile;
  }
  for (let step = 0; step < lead; step += 1) {
    const next = neighbor(maze, tile, direction);
    if (!next) break;
    tile = next;
  }
  return tile;
}

export interface TargetContext {
  readonly maze: Maze;
  readonly player: Actor;
  readonly phase: EnemyPhase;
  readonly distances: DistanceCache;
  readonly config: GameConfig;
}

/**
 * The tile this enemy is currently heading for.
 *
 * Scatter sends every enemy to its own corner. During chase the four policies
 * differ in what they aim at, which is what makes them distinguishable in a
 * fixture rather than only in colour.
 */
export function enemyTarget(enemy: Enemy, context: TargetContext): GridPosition {
  const { maze, player, phase, config } = context;
  const definition = enemy.definition;
  if (phase === 'scatter') {
    return definition.scatterTarget;
  }

  switch (definition.kind) {
    case 'chaser':
      return actorTile(maze, player);
    case 'ambusher':
      return leadTile(maze, player, config.ambushLeadTiles);
    case 'patroller': {
      const waypoint = definition.patrolWaypoints[enemy.waypointIndex];
      return waypoint ?? definition.scatterTarget;
    }
    case 'prowler': {
      const playerTile = actorTile(maze, player);
      const distance = context.distances.between(actorTile(maze, enemy.actor), playerTile, 'maze');
      return distance >= config.prowlerPursuitTiles ? playerTile : definition.scatterTarget;
    }
    default:
      return definition.scatterTarget;
  }
}

/** Every direction that leaves `tile` legally under `traversal`, in turn order. */
export function legalTurns(maze: Maze, tile: GridPosition, traversal: Traversal): Direction[] {
  return TURN_ORDER.filter((direction) => neighbor(maze, tile, direction, traversal) !== null);
}

/**
 * The candidate turns an enemy may consider: everything legal except an
 * immediate reversal, unless a reversal is the only way out (a dead end) or the
 * caller has an explicit reason to allow one.
 */
function candidateTurns(
  maze: Maze,
  tile: GridPosition,
  current: Direction | null,
  traversal: Traversal,
): Direction[] {
  const exits = legalTurns(maze, tile, traversal);
  if (!current) {
    return exits;
  }
  const forward = exits.filter((exit) => exit !== oppositeDirection(current));
  return forward.length > 0 ? forward : exits;
}

/**
 * Picks the legal turn whose next tile is closest to `target` along real maze
 * paths, breaking ties by `TURN_ORDER`. A target the graph cannot reach leaves
 * every candidate at an infinite distance, in which case the first candidate in
 * turn order is taken so the enemy keeps moving legally instead of stopping.
 */
export function chooseTargetedDirection(
  maze: Maze,
  tile: GridPosition,
  current: Direction | null,
  target: GridPosition,
  traversal: Traversal,
  distances: DistanceCache,
): Direction | null {
  const candidates = candidateTurns(maze, tile, current, traversal);
  if (candidates.length === 0) {
    return null;
  }
  const fromTarget = distances.from(target, traversal);

  let best: Direction | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const direction of candidates) {
    const next = neighbor(maze, tile, direction, traversal) as GridPosition;
    const distance = fromTarget.get(positionKey(next)) ?? Number.POSITIVE_INFINITY;
    if (best === null || distance < bestDistance) {
      best = direction;
      bestDistance = distance;
    }
  }
  return best;
}

/** Frightened movement: a seeded uniform choice among the same candidate turns. */
export function chooseFrightenedDirection(
  maze: Maze,
  tile: GridPosition,
  current: Direction | null,
  random: RandomSource,
): Direction | null {
  return pickRandom(candidateTurns(maze, tile, current, 'maze'), random);
}

/**
 * Applies the state changes that depend on where the enemy has just arrived:
 * an exiting enemy joins the maze at the corridor outside the door, a returning
 * enemy starts its wait inside it, and a patroller advances its circuit.
 */
export function applyArrival(enemy: Enemy, tile: GridPosition, maze: Maze, waitMs: number): void {
  const home = maze.home;
  if (home && enemy.state === 'exiting' && samePosition(tile, home.exit)) {
    enemy.state = 'roaming';
    // Rejoining play never reverses: the enemy keeps heading away from the door.
    enemy.reverseRequested = false;
    return;
  }
  if (home && enemy.state === 'returning' && samePosition(tile, home.rest)) {
    enemy.state = 'resting';
    enemy.waitRemainingMs = waitMs;
    enemy.reverseRequested = false;
    return;
  }
  if (enemy.state === 'roaming' && enemy.definition.kind === 'patroller') {
    const waypoints = enemy.definition.patrolWaypoints;
    const current = waypoints[enemy.waypointIndex];
    if (current && samePosition(tile, current)) {
      enemy.waypointIndex = (enemy.waypointIndex + 1) % waypoints.length;
    }
  }
}
