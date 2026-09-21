import type { GridPosition } from './maze.js';

/** The four required enemy personalities from PRD section 2. */
export type EnemyKind = 'chaser' | 'ambusher' | 'patroller' | 'prowler';

/**
 * One enemy's fixed identity. Definition `i` takes the maze's enemy start slot
 * `i`, so the order here also decides which enemy leaves home first.
 */
export interface EnemyDefinition {
  /** Stable identity, used by snapshots, tests and the renderer. */
  readonly id: string;
  /** Human-readable name shown in the instructions. */
  readonly name: string;
  readonly kind: EnemyKind;
  /** Corner this enemy heads for during the scatter phase. */
  readonly scatterTarget: GridPosition;
  /** Patrol circuit, used by the `patroller` kind during the chase phase. */
  readonly patrolWaypoints: readonly GridPosition[];
  /** Active CHASE time before this enemy leaves home, from a run or death reset. */
  readonly releaseDelayMs: number;
}

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
  /** Roaming enemy speed as a fraction of the player's. */
  readonly enemySpeedFactor: number;
  /** Frightened enemy speed as a fraction of the player's. */
  readonly frightenedSpeedFactor: number;
  /** Speed of an eaten enemy travelling home, as a fraction of the player's. */
  readonly returningSpeedFactor: number;
  /** Points awarded the first time the player crosses a dot tile. */
  readonly dotScore: number;
  /** Points awarded the first time the player crosses a power pellet tile. */
  readonly powerPelletScore: number;
  /** Points for successive enemies eaten within one frightened effect. */
  readonly enemyEatScores: readonly number[];
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
  /** Centre-to-centre distance, in tiles, at which the player touches an enemy. */
  readonly enemyContactRadiusTiles: number;
  /**
   * Largest distance any actor may travel between two contact checks. It bounds
   * a simulation step regardless of how long the caller's step is, so neither a
   * fast player nor the faster returning enemy can pass through anything.
   */
  readonly maxSubstepTiles: number;
  /** Length of the scatter phase, in active CHASE milliseconds. */
  readonly scatterPhaseMs: number;
  /** Length of the chase phase, in active CHASE milliseconds. */
  readonly chasePhaseMs: number;
  /** How long a power pellet keeps enemies frightened, in active CHASE milliseconds. */
  readonly frightenedMs: number;
  /** How long an eaten enemy waits at home before leaving again. */
  readonly homeWaitMs: number;
  /** Legal steps the ambusher aims ahead of the player. */
  readonly ambushLeadTiles: number;
  /** Path distance at or above which the prowler pursues instead of retreating. */
  readonly prowlerPursuitTiles: number;
  /** Lives a fresh run starts with. */
  readonly startingLives: number;
  /** Length of the death presentation, in milliseconds. */
  readonly dyingPresentationMs: number;
  /** Protection granted after respawning, in active CHASE milliseconds. */
  readonly protectionMs: number;
  /** The enemies to place, in maze start-slot order. */
  readonly enemies: readonly EnemyDefinition[];
  /** How long a spawned fruit stays collectible, in active CHASE milliseconds. */
  readonly fruitLifetimeMs: number;
  /** Fraction of the level's original normal dots consumed at which each fruit threshold fires. */
  readonly fruitThresholdRatios: readonly [number, number];
  /** Fruit points per collection, multiplied by the current level number. */
  readonly fruitScorePerLevel: number;
  /** Score at which the run's one extra life is granted. */
  readonly extraLifeScoreThreshold: number;
}

/**
 * Level one's four enemies. Scatter corners and patrol waypoints are authored
 * corridors of `LEVEL_ONE_LAYOUT`; the `Game` constructor rejects a set that
 * the maze cannot reach, so a retuning mistake fails loudly rather than leaving
 * an enemy circling an unreachable target.
 */
export const DEFAULT_ENEMIES: readonly EnemyDefinition[] = [
  {
    id: 'chaser',
    name: 'Chaser',
    kind: 'chaser',
    scatterTarget: { col: 19, row: 1 },
    patrolWaypoints: [],
    releaseDelayMs: 0,
  },
  {
    id: 'ambusher',
    name: 'Ambusher',
    kind: 'ambusher',
    scatterTarget: { col: 1, row: 1 },
    patrolWaypoints: [],
    releaseDelayMs: 2000,
  },
  {
    id: 'patroller',
    name: 'Patroller',
    kind: 'patroller',
    scatterTarget: { col: 1, row: 21 },
    patrolWaypoints: [
      { col: 1, row: 4 },
      { col: 19, row: 4 },
      { col: 19, row: 19 },
      { col: 1, row: 19 },
    ],
    releaseDelayMs: 4000,
  },
  {
    id: 'prowler',
    name: 'Prowler',
    kind: 'prowler',
    scatterTarget: { col: 19, row: 21 },
    patrolWaypoints: [],
    releaseDelayMs: 6000,
  },
];

export const DEFAULT_CONFIG: GameConfig = {
  simulationStepMs: 1000 / 120,
  maxStepsPerFrame: 12,
  playerSpeedTilesPerSecond: 6,
  ballSpeedFactor: 0.8,
  enemySpeedFactor: 0.75,
  frightenedSpeedFactor: 0.5,
  returningSpeedFactor: 1.25,
  dotScore: 10,
  powerPelletScore: 50,
  enemyEatScores: [200, 400, 800, 1600],
  letterScore: 100,
  wordBonusScore: 1000,
  resumeCountdownMs: 2000,
  minBallSpawnDistanceTiles: 6,
  captureRadiusTiles: 0.5,
  enemyContactRadiusTiles: 0.5,
  maxSubstepTiles: 0.25,
  scatterPhaseMs: 7000,
  chasePhaseMs: 20000,
  frightenedMs: 6000,
  homeWaitMs: 1000,
  ambushLeadTiles: 4,
  prowlerPursuitTiles: 8,
  startingLives: 3,
  dyingPresentationMs: 750,
  protectionMs: 2000,
  enemies: DEFAULT_ENEMIES,
  fruitLifetimeMs: 10_000,
  fruitThresholdRatios: [0.3, 0.7],
  fruitScorePerLevel: 100,
  extraLifeScoreThreshold: 10_000,
};

/** The fastest any actor moves, as a fraction of player speed. */
export function fastestSpeedFactor(config: GameConfig): number {
  return Math.max(
    1,
    config.ballSpeedFactor,
    config.enemySpeedFactor,
    config.frightenedSpeedFactor,
    config.returningSpeedFactor,
  );
}
