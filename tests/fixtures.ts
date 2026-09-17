import { DEFAULT_CONFIG } from '../src/game/config.js';
import type { Game } from '../src/game/game.js';
import { createMaze, type Maze } from '../src/game/maze.js';

/** Straight corridor with walls at both ends. Spawn at column 1, row 1. */
export const CORRIDOR_LAYOUT = ['#######', '#P....#', '#######'] as const;

/** Corridor that turns down only at column 3, for buffered-turn checks. */
export const JUNCTION_LAYOUT = ['#####', '#P..#', '###.#', '###.#', '#####'] as const;

/** Single row with a matched pair of tunnel endpoints. */
export const TUNNEL_LAYOUT = ['#####', 'T.P.T', '#####'] as const;

export function corridorMaze(): Maze {
  return createMaze([...CORRIDOR_LAYOUT]);
}

export function junctionMaze(): Maze {
  return createMaze([...JUNCTION_LAYOUT]);
}

export function tunnelMaze(): Maze {
  return createMaze([...TUNNEL_LAYOUT]);
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
