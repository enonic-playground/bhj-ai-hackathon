import { actorTile, isAtTileCentre } from '../src/game/actor.js';
import {
  DEFAULT_CONFIG,
  type EnemyDefinition,
  type EnemyKind,
  type GameConfig,
} from '../src/game/config.js';
import { DIRECTIONS, type Direction } from '../src/game/direction.js';
import type { Enemy, EnemyState } from '../src/game/enemy.js';
import { Game, type BallSpawnSelector, type GameOptions } from '../src/game/game.js';
import { createMaze, neighbor, positionKey, type GridPosition, type Maze } from '../src/game/maze.js';
import { pathDistances } from '../src/game/paths.js';
import { createSeededRandom } from '../src/game/random.js';
import { fixedWord } from '../src/game/words.js';

/** Straight corridor with walls at both ends. Spawn at column 1, row 1. */
export const CORRIDOR_LAYOUT = ['#######', '#P....#', '#######'] as const;

/** Corridor that turns down only at column 3, for buffered-turn checks. */
export const JUNCTION_LAYOUT = ['#####', '#P..#', '###.#', '###.#', '#####'] as const;

/** Single row with a matched pair of tunnel endpoints. */
export const TUNNEL_LAYOUT = ['#####', 'T.P.T', '#####'] as const;

/** Ring corridor: long enough for a ball spawn six tiles from the player. */
export const RING_LAYOUT = [
  '#########',
  '#.......#',
  '#.#####.#',
  '#.#####.#',
  '#P#####.#',
  '#.#####.#',
  '#.......#',
  '#########',
] as const;

export function corridorMaze(): Maze {
  return createMaze([...CORRIDOR_LAYOUT]);
}

export function junctionMaze(): Maze {
  return createMaze([...JUNCTION_LAYOUT]);
}

export function tunnelMaze(): Maze {
  return createMaze([...TUNNEL_LAYOUT]);
}

export function ringMaze(): Maze {
  return createMaze([...RING_LAYOUT]);
}

/** A spawn rule that leaves a maze without a ball at all. */
export const NO_BALL: BallSpawnSelector = () => null;

/** A spawn rule that always places the ball on one tile. */
export function ballAt(position: GridPosition): BallSpawnSelector {
  return () => position;
}

/**
 * A game with pinned word, randomness and ball placement, so every assertion
 * below describes one reproducible round. Callers override only what their
 * check is about.
 */
export function createTestGame(
  maze: Maze,
  options: GameOptions = {},
  config: GameConfig = DEFAULT_CONFIG,
): Game {
  return new Game(maze, config, {
    random: createSeededRandom(1),
    selectWord: fixedWord('APPLE', 'Fruit'),
    ...options,
  });
}

/**
 * A deterministic game with no ball in the maze, for movement, dot, input and
 * cadence checks that are not about the ball.
 */
export function ballFreeGame(maze: Maze, options: GameOptions = {}): Game {
  return createTestGame(maze, { selectBallSpawn: NO_BALL, ...options });
}

export const STEP_SECONDS = DEFAULT_CONFIG.simulationStepMs / 1000;

/** Advances a game by whole fixed steps, as the animation loop would. */
export function runSteps(game: Game, steps: number, stepSeconds = STEP_SECONDS): void {
  for (let i = 0; i < steps; i += 1) {
    game.step(stepSeconds);
  }
}

/** Advances a game by `ms` of simulated time using whole fixed steps. */
export function runForMs(game: Game, ms: number, stepSeconds = STEP_SECONDS): void {
  runSteps(game, Math.round(ms / 1000 / stepSeconds), stepSeconds);
}

/** Runs until `done` reports true, or fails after `limitMs` of simulated time. */
export function runUntil(
  game: Game,
  done: () => boolean,
  limitMs = 60_000,
  stepSeconds = STEP_SECONDS,
): void {
  const limit = Math.round(limitMs / 1000 / stepSeconds);
  for (let i = 0; i < limit; i += 1) {
    if (done()) return;
    game.step(stepSeconds);
  }
  if (!done()) {
    throw new Error(`condition not reached within ${limitMs} ms of simulated time`);
  }
}

/**
 * Small arena with an enemy home: a ring corridor, one power pellet at (1, 1),
 * a door with exactly one corridor outside it and four enemy start slots.
 * Deterministic enough that a whole release, chase, pellet and return cycle
 * fits in a handful of simulated seconds.
 */
export const ARENA_LAYOUT = [
  '###########',
  '#o.......o#',
  '#.........#',
  '#.###=###.#',
  '#.#EEhEE#.#',
  '#.#######.#',
  '#....P....#',
  '###########',
] as const;

/** Two-row arena with matched tunnel endpoints, for seam contact checks. */
export const SEAM_ARENA_LAYOUT = [
  '###########',
  'T....P....T',
  '#.###=###.#',
  '#.#EEhEE#.#',
  '#.#######.#',
  '#.........#',
  '###########',
] as const;

export function arenaMaze(): Maze {
  return createMaze([...ARENA_LAYOUT]);
}

export function seamArenaMaze(): Maze {
  return createMaze([...SEAM_ARENA_LAYOUT]);
}

/** Corners of `ARENA_LAYOUT`, used as scatter targets and patrol waypoints. */
export const ARENA_CORNERS: Record<'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight', GridPosition> = {
  topLeft: { col: 1, row: 1 },
  topRight: { col: 9, row: 1 },
  bottomLeft: { col: 1, row: 6 },
  bottomRight: { col: 9, row: 6 },
};

/** One enemy definition per kind, released immediately unless overridden. */
export function arenaEnemy(
  kind: EnemyKind,
  overrides: Partial<EnemyDefinition> = {},
): EnemyDefinition {
  const scatterTarget =
    kind === 'chaser'
      ? ARENA_CORNERS.topRight
      : kind === 'ambusher'
        ? ARENA_CORNERS.topLeft
        : kind === 'patroller'
          ? ARENA_CORNERS.bottomLeft
          : ARENA_CORNERS.bottomRight;
  return {
    id: kind,
    name: kind,
    kind,
    scatterTarget,
    patrolWaypoints: kind === 'patroller' ? [ARENA_CORNERS.bottomLeft, ARENA_CORNERS.topLeft] : [],
    releaseDelayMs: 0,
    ...overrides,
  };
}

/**
 * Moves one enemy to a chosen tile and state.
 *
 * Collision, score-chain and protection edges need an encounter to happen at a
 * known place and moment; waiting for one to arise from play would make the
 * assertions timing-dependent. This only arranges a starting condition through
 * the same objects the simulation itself uses — every rule under test still
 * runs unchanged — and it exists in the test fixtures, never in the app.
 */
export function placeEnemy(
  game: Game,
  id: string,
  position: GridPosition,
  state: EnemyState,
  direction: Direction | null = null,
): Enemy {
  const enemy = game.enemies.find((candidate) => candidate.definition.id === id);
  if (!enemy) {
    throw new Error(`no enemy with id ${id}`);
  }
  enemy.actor.x = position.col;
  enemy.actor.y = position.row;
  enemy.actor.direction = direction;
  enemy.actor.pendingDirection = null;
  enemy.state = state;
  enemy.waitRemainingMs = 0;
  enemy.reverseRequested = false;
  return enemy;
}

/** Parks an enemy exactly where the player is, for a contact on the next slice. */
export function placeEnemyOnPlayer(game: Game, id: string, state: EnemyState): Enemy {
  return placeEnemy(game, id, { col: game.player.x, row: game.player.y }, state);
}

/** Puts the player on a tile centre, facing `direction`. */
export function placePlayer(game: Game, position: GridPosition, direction: Direction | null = null): void {
  game.player.x = position.col;
  game.player.y = position.row;
  game.player.direction = direction;
  game.player.pendingDirection = null;
}

/**
 * Drives the player to `target` with ordinary direction requests, choosing each
 * turn from the same maze graph the game uses. Nothing is teleported: the
 * player walks there.
 */
export function steerPlayerTo(game: Game, target: GridPosition, limitMs = 20_000): void {
  const distances = pathDistances(game.maze, target);
  const limit = Math.round(limitMs / 1000 / STEP_SECONDS);

  for (let i = 0; i < limit; i += 1) {
    const tile = actorTile(game.maze, game.player);
    const onTarget = tile.col === target.col && tile.row === target.row;
    // Only a tile centre counts as arrival: that is where a collectible is
    // resolved, so a check that reads the score straight afterwards is exact.
    if (onTarget && isAtTileCentre(game.player)) {
      return;
    }
    // On the target tile but not yet at its centre, the player keeps going
    // rather than being steered back and forth across the last half tile.
    if (!onTarget) {
      let best: Direction | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const direction of DIRECTIONS) {
        const next = neighbor(game.maze, tile, direction);
        if (!next) continue;
        const distance = distances.get(positionKey(next)) ?? Number.POSITIVE_INFINITY;
        if (distance < bestDistance) {
          bestDistance = distance;
          best = direction;
        }
      }
      if (best) {
        game.requestDirection(best);
      }
    }
    game.step(STEP_SECONDS);
    if (game.status !== 'chase') {
      return;
    }
  }
  throw new Error(`the player never reached ${positionKey(target)}`);
}
