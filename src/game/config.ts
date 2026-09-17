/** Tunable simulation values. Gameplay code must read these rather than inlining numbers. */
export interface GameConfig {
  /** Length of one fixed simulation step, in milliseconds. */
  readonly simulationStepMs: number;
  /** Upper bound on simulation steps replayed for a single animation frame. */
  readonly maxStepsPerFrame: number;
  /** Player speed in maze tiles per second. */
  readonly playerSpeedTilesPerSecond: number;
  /** Points awarded the first time the player crosses a dot tile. */
  readonly dotScore: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  simulationStepMs: 1000 / 120,
  maxStepsPerFrame: 12,
  playerSpeedTilesPerSecond: 6,
  dotScore: 10,
};
