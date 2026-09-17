/** Tunable simulation values. Gameplay code must read these rather than inlining numbers. */
export interface GameConfig {
  /** Length of one fixed simulation step, in milliseconds. */
  readonly simulationStepMs: number;
  /** Upper bound on simulation steps replayed for a single animation frame. */
  readonly maxStepsPerFrame: number;
  /** Player speed in maze tiles per second. */
  readonly playerSpeedTilesPerSecond: number;
  /** Ball speed as a fraction of the player's; the PRD requires it to stay below 1. */
  readonly ballSpeedFactor: number;
  /** Points awarded the first time the player crosses a dot tile. */
  readonly dotScore: number;
  /** Points awarded per position revealed by a correct letter. */
  readonly letterScore: number;
  /** One-time bonus for solving the word. */
  readonly wordBonusScore: number;
  /** Length of the countdown that follows a wrong letter, in milliseconds. */
  readonly resumeCountdownMs: number;
  /** Shortest legal path, in tiles, between the player and a new ball spawn. */
  readonly minBallSpawnDistanceTiles: number;
  /**
   * Centre-to-centre distance, in tiles, at which the player catches the ball.
   * Half a tile means their drawn bodies overlap; two actors this close always
   * share a corridor, so a capture can never reach through a wall.
   */
  readonly captureRadiusTiles: number;
  /**
   * Largest distance either actor may travel between two contact checks. It
   * bounds a simulation step regardless of how long the caller's step is, so a
   * fast player and an oncoming ball cannot pass through one another.
   */
  readonly maxSubstepTiles: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  simulationStepMs: 1000 / 120,
  maxStepsPerFrame: 12,
  playerSpeedTilesPerSecond: 6,
  ballSpeedFactor: 0.8,
  dotScore: 10,
  letterScore: 100,
  wordBonusScore: 1000,
  resumeCountdownMs: 2000,
  minBallSpawnDistanceTiles: 6,
  captureRadiusTiles: 0.5,
  maxSubstepTiles: 0.25,
};
