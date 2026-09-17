import { DEFAULT_CONFIG, type GameConfig } from '../src/game/config.js';
import { Game, type BallSpawnSelector, type GameOptions } from '../src/game/game.js';
import { createMaze, type GridPosition, type Maze } from '../src/game/maze.js';
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
