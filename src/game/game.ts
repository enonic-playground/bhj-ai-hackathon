import { advanceActor, createActor, type Actor } from './actor.js';
import { DEFAULT_CONFIG, type GameConfig } from './config.js';
import type { Direction } from './direction.js';
import { createLevelOneMaze } from './mazeData.js';
import { positionKey, type GridPosition, type Maze } from './maze.js';

/** M1 states. The remaining PRD states arrive with their own milestones. */
export type GameStatus = 'title' | 'chase';

export interface GameSnapshot {
  readonly status: GameStatus;
  readonly level: number;
  readonly score: number;
  readonly dotsRemaining: number;
  readonly player: {
    readonly x: number;
    readonly y: number;
    readonly direction: Direction | null;
    readonly pendingDirection: Direction | null;
  };
}

/**
 * Owns all maze state and advances it in fixed steps. It has no knowledge of
 * canvas, DOM, input events or animation scheduling, so tests can drive it
 * directly.
 */
export class Game {
  readonly maze: Maze;
  readonly config: GameConfig;

  #status: GameStatus = 'title';
  #level = 1;
  #score = 0;
  #dots = new Set<string>();
  #player: Actor;

  constructor(maze: Maze = createLevelOneMaze(), config: GameConfig = DEFAULT_CONFIG) {
    this.maze = maze;
    this.config = config;
    this.#player = createActor(maze.spawn);
    this.#resetLevelState();
  }

  get status(): GameStatus {
    return this.#status;
  }

  get score(): number {
    return this.#score;
  }

  get level(): number {
    return this.#level;
  }

  get player(): Actor {
    return this.#player;
  }

  get dotsRemaining(): number {
    return this.#dots.size;
  }

  hasDot(position: GridPosition): boolean {
    return this.#dots.has(positionKey(position));
  }

  /** Every dot still on the board, for rendering. */
  remainingDots(): GridPosition[] {
    return this.maze.dotTiles.filter((dot) => this.hasDot(dot));
  }

  /** Leaves the title screen and starts a fresh level one. */
  startLevel(): void {
    this.#level = 1;
    this.#score = 0;
    this.#resetLevelState();
    this.#status = 'chase';
  }

  returnToTitle(): void {
    this.#status = 'title';
    this.clearInput();
  }

  /** Records the latest requested direction; ignored outside of play. */
  requestDirection(direction: Direction): boolean {
    if (this.#status !== 'chase') {
      return false;
    }
    this.#player.pendingDirection = direction;
    return true;
  }

  /** Drops queued input, for context changes such as focus loss. */
  clearInput(): void {
    this.#player.pendingDirection = null;
  }

  /** Advances the simulation by one fixed step of `stepSeconds`. */
  step(stepSeconds: number): void {
    if (this.#status !== 'chase' || stepSeconds <= 0) {
      return;
    }
    const distance = this.config.playerSpeedTilesPerSecond * stepSeconds;
    const centres = advanceActor(this.maze, this.#player, distance);
    for (const centre of centres) {
      this.#collectDot(centre);
    }
  }

  snapshot(): GameSnapshot {
    return {
      status: this.#status,
      level: this.#level,
      score: this.#score,
      dotsRemaining: this.#dots.size,
      player: {
        x: this.#player.x,
        y: this.#player.y,
        direction: this.#player.direction,
        pendingDirection: this.#player.pendingDirection,
      },
    };
  }

  #collectDot(position: GridPosition): void {
    const key = positionKey(position);
    if (!this.#dots.delete(key)) {
      return; // Already collected: no second award.
    }
    this.#score += this.config.dotScore;
  }

  #resetLevelState(): void {
    this.#dots = new Set(this.maze.dotTiles.map(positionKey));
    this.#player = createActor(this.maze.spawn);
  }
}
