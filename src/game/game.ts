import { advanceActor, createActor, type Actor } from './actor.js';
import { advanceBall, createBall, isCaptured } from './ball.js';
import { DEFAULT_CONFIG, type GameConfig } from './config.js';
import type { Direction } from './direction.js';
import { createLevelOneMaze } from './mazeData.js';
import { positionKey, type GridPosition, type Maze } from './maze.js';
import { createSystemRandom, type RandomSource } from './random.js';
import { chooseBallSpawn } from './spawn.js';
import {
  countOccurrences,
  isWordSolved,
  maskWord,
  normalizeLetter,
  selectSeedWord,
  validateWordEntry,
  type WordEntry,
} from './words.js';

/**
 * States implemented so far. `resuming` is the countdown after a wrong letter.
 * PAUSED, DYING, GAME_OVER and CAMPAIGN_COMPLETE arrive with their milestones.
 */
export type GameStatus = 'title' | 'chase' | 'guess' | 'resuming' | 'level-complete';

/** Rounding slack for the countdown, far below anything a player can perceive. */
const COUNTDOWN_EPSILON_MS = 1e-6;

export type GuessOutcome =
  /** Revealed at least one position and guessing continues. */
  | 'correct'
  /** Revealed the last hidden position and completed the round. */
  | 'solved'
  /** Not in the word: recorded, then the resume countdown starts. */
  | 'wrong'
  /** Already guessed; nothing changes. */
  | 'duplicate'
  /** Not a single A–Z letter. */
  | 'invalid'
  /** The current state does not accept guesses. */
  | 'ignored';

export interface GuessResult {
  readonly outcome: GuessOutcome;
  readonly letter: string | null;
  /** Positions revealed by this guess. */
  readonly revealed: number;
  readonly awarded: number;
}

export interface ActorSnapshot {
  readonly x: number;
  readonly y: number;
  readonly direction: Direction | null;
  readonly pendingDirection: Direction | null;
}

export interface WordSnapshot {
  readonly category: string;
  readonly length: number;
  /** Hidden positions are null, so the readout never leaks the answer. */
  readonly mask: readonly (string | null)[];
  readonly revealedLetters: readonly string[];
  readonly wrongLetters: readonly string[];
  readonly solved: boolean;
  /** The word itself, only once the round is over. */
  readonly answer: string | null;
}

export interface GameSnapshot {
  readonly status: GameStatus;
  readonly level: number;
  readonly score: number;
  readonly dotsRemaining: number;
  readonly player: ActorSnapshot;
  /** Absent while the player is guessing or the round is over. */
  readonly ball: ActorSnapshot | null;
  readonly word: WordSnapshot;
  readonly lastGuess: { readonly letter: string; readonly correct: boolean } | null;
  readonly resumeRemainingMs: number;
}

/**
 * Chooses where a new ball appears, or null when the maze offers no legal
 * place for one. Tests override it to pin a spawn, or to run a maze with no
 * ball at all while checking movement and dots; ordinary play always uses the
 * default rule.
 */
export type BallSpawnSelector = (
  maze: Maze,
  player: Actor,
  random: RandomSource,
) => GridPosition | null;

export interface GameOptions {
  /** Injected for reproducible spawns and ball decisions. */
  readonly random?: RandomSource;
  /** Injected word selection; tests and fixtures pin a known word. */
  readonly selectWord?: (random: RandomSource) => WordEntry;
  /** Injected ball placement; defaults to the PRD's distance rule. */
  readonly selectBallSpawn?: BallSpawnSelector;
}

/**
 * Owns all round state and advances it in fixed steps. It has no knowledge of
 * canvas, DOM, input events or animation scheduling, so tests can drive it
 * directly. Every state change goes through one of the private transitions
 * below, so a repeated event cannot respawn a ball or award a bonus twice.
 */
export class Game {
  readonly maze: Maze;
  readonly config: GameConfig;

  readonly #random: RandomSource;
  readonly #selectWord: (random: RandomSource) => WordEntry;
  readonly #selectBallSpawn: BallSpawnSelector;

  #status: GameStatus = 'title';
  #level = 1;
  #score = 0;
  #dots = new Set<string>();
  #player: Actor;
  #ball: Actor | null = null;
  #word: WordEntry;
  #revealedLetters: string[] = [];
  #wrongLetters: string[] = [];
  #lastGuess: { letter: string; correct: boolean } | null = null;
  #resumeRemainingMs = 0;
  /** Simulated time spent in chase; drives animation without a wall clock. */
  #activeTimeMs = 0;

  constructor(
    maze: Maze = createLevelOneMaze(),
    config: GameConfig = DEFAULT_CONFIG,
    options: GameOptions = {},
  ) {
    this.maze = maze;
    this.config = config;
    this.#random = options.random ?? createSystemRandom();
    this.#selectWord = options.selectWord ?? selectSeedWord;
    this.#selectBallSpawn =
      options.selectBallSpawn ??
      ((currentMaze, player, random) =>
        chooseBallSpawn(currentMaze, player, {
          random,
          minDistanceTiles: this.config.minBallSpawnDistanceTiles,
        }));
    this.#player = createActor(maze.spawn);
    this.#word = validateWordEntry(this.#selectWord(this.#random));
    this.#resetRoundState();
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

  /** The ball, or null while guessing, on the title screen or after a solve. */
  get ball(): Actor | null {
    return this.#ball;
  }

  get dotsRemaining(): number {
    return this.#dots.size;
  }

  get activeTimeMs(): number {
    return this.#activeTimeMs;
  }

  get resumeRemainingMs(): number {
    return this.#resumeRemainingMs;
  }

  /** True while the maze simulation is frozen but a round is still in play. */
  get isFrozen(): boolean {
    return this.#status === 'guess' || this.#status === 'resuming' || this.#status === 'level-complete';
  }

  hasDot(position: GridPosition): boolean {
    return this.#dots.has(positionKey(position));
  }

  /** Every dot still on the board, for rendering. */
  remainingDots(): GridPosition[] {
    return this.maze.dotTiles.filter((dot) => this.hasDot(dot));
  }

  /** Leaves the title screen and starts a fresh round; also drives "Play again". */
  startLevel(): void {
    this.#level = 1;
    this.#score = 0;
    this.#word = validateWordEntry(this.#selectWord(this.#random));
    this.#resetRoundState();
    this.#status = 'chase';
    this.#spawnBall();
  }

  returnToTitle(): void {
    this.#status = 'title';
    this.#ball = null;
    this.clearInput();
  }

  /** Records the latest requested direction; ignored outside chase. */
  requestDirection(direction: Direction): boolean {
    if (this.#status !== 'chase') {
      return false;
    }
    this.#player.pendingDirection = direction;
    return true;
  }

  /**
   * Applies a letter guess. Only `guess` accepts them, so a stray key or click
   * during the chase, the countdown or the result panel changes nothing.
   */
  guess(input: string): GuessResult {
    const ignored = (outcome: GuessOutcome, letter: string | null): GuessResult => ({
      outcome,
      letter,
      revealed: 0,
      awarded: 0,
    });

    const letter = normalizeLetter(input);
    if (this.#status !== 'guess') {
      return ignored('ignored', letter);
    }
    if (!letter) {
      return ignored('invalid', null);
    }
    if (this.#revealedLetters.includes(letter) || this.#wrongLetters.includes(letter)) {
      return ignored('duplicate', letter);
    }

    const revealed = countOccurrences(this.#word.word, letter);
    if (revealed === 0) {
      this.#wrongLetters.push(letter);
      this.#lastGuess = { letter, correct: false };
      this.#enterResuming();
      return ignored('wrong', letter);
    }

    this.#revealedLetters.push(letter);
    const awarded = revealed * this.config.letterScore;
    this.#score += awarded;
    this.#lastGuess = { letter, correct: true };

    if (isWordSolved(this.#word.word, this.#revealedSet())) {
      this.#completeRound();
      return { outcome: 'solved', letter, revealed, awarded };
    }
    return { outcome: 'correct', letter, revealed, awarded };
  }

  /** Drops queued input, for context changes such as focus loss. */
  clearInput(): void {
    this.#player.pendingDirection = null;
  }

  /**
   * Advances the simulation by one fixed step of `stepSeconds`. Only chase moves
   * the maze; the countdown state advances nothing but its own timer, and the
   * guessing and result states advance nothing at all.
   */
  step(stepSeconds: number): void {
    if (!(stepSeconds > 0)) {
      return;
    }
    if (this.#status === 'resuming') {
      this.#advanceCountdown(stepSeconds);
      return;
    }
    if (this.#status !== 'chase') {
      return;
    }

    const playerDistance = this.config.playerSpeedTilesPerSecond * stepSeconds;
    const ballDistance = playerDistance * this.config.ballSpeedFactor;
    // Contact is tested after every bounded substep, so however long the
    // caller's step is, the player and an oncoming ball cannot swap sides
    // without touching.
    const substeps = Math.max(
      1,
      Math.ceil(Math.max(playerDistance, ballDistance) / this.config.maxSubstepTiles),
    );

    for (let index = 0; index < substeps; index += 1) {
      if (this.#status !== 'chase') {
        return; // A capture inside this step ends the chase immediately.
      }
      this.#activeTimeMs += (stepSeconds * 1000) / substeps;
      for (const centre of advanceActor(this.maze, this.#player, playerDistance / substeps)) {
        this.#collectDot(centre);
      }
      if (this.#ball) {
        advanceBall(this.maze, this.#ball, ballDistance / substeps, this.#random);
        if (isCaptured(this.maze, this.#player, this.#ball, this.config.captureRadiusTiles)) {
          this.#enterGuess();
        }
      }
    }
  }

  snapshot(): GameSnapshot {
    const revealed = this.#revealedSet();
    const solved = isWordSolved(this.#word.word, revealed);
    return {
      status: this.#status,
      level: this.#level,
      score: this.#score,
      dotsRemaining: this.#dots.size,
      player: actorSnapshot(this.#player),
      ball: this.#ball ? actorSnapshot(this.#ball) : null,
      word: {
        category: this.#word.category,
        length: this.#word.word.length,
        mask: maskWord(this.#word.word, revealed),
        revealedLetters: [...this.#revealedLetters],
        wrongLetters: [...this.#wrongLetters],
        solved,
        answer: this.#status === 'level-complete' ? this.#word.word : null,
      },
      lastGuess: this.#lastGuess ? { ...this.#lastGuess } : null,
      resumeRemainingMs: this.#resumeRemainingMs,
    };
  }

  #revealedSet(): ReadonlySet<string> {
    return new Set(this.#revealedLetters);
  }

  /** Capture: freeze the maze, remove the ball and open guessing exactly once. */
  #enterGuess(): void {
    if (this.#status !== 'chase') {
      return;
    }
    this.#status = 'guess';
    this.#ball = null;
    this.#lastGuess = null;
    this.clearInput();
  }

  /** Wrong letter: pick the next spawn once, then freeze until the countdown ends. */
  #enterResuming(): void {
    if (this.#status !== 'guess') {
      return;
    }
    this.#status = 'resuming';
    this.#resumeRemainingMs = this.config.resumeCountdownMs;
    this.#spawnBall();
    this.clearInput();
  }

  #advanceCountdown(stepSeconds: number): void {
    this.#resumeRemainingMs -= stepSeconds * 1000;
    // A step length such as 1000/120 ms cannot be represented exactly, so a
    // countdown of a whole number of steps can end a fraction of a nanosecond
    // short. Treat that residue as elapsed rather than running an extra step.
    if (this.#resumeRemainingMs > COUNTDOWN_EPSILON_MS) {
      return;
    }
    this.#resumeRemainingMs = 0;
    this.#status = 'chase';
    // Anything held or queued during the countdown is dropped on the way out.
    this.clearInput();
  }

  /** Final letter: award the word bonus once and stop the round. */
  #completeRound(): void {
    if (this.#status !== 'guess') {
      return;
    }
    this.#status = 'level-complete';
    this.#score += this.config.wordBonusScore;
    this.#ball = null;
    this.clearInput();
  }

  #spawnBall(): void {
    const spawn = this.#selectBallSpawn(this.maze, this.#player, this.#random);
    // A fixture with no eligible tile simply has no ball; it never loops or
    // spawns on the player. The authored maze always offers one.
    this.#ball = spawn ? createBall(spawn) : null;
  }

  #collectDot(position: GridPosition): void {
    const key = positionKey(position);
    if (!this.#dots.delete(key)) {
      return; // Already collected: no second award.
    }
    this.#score += this.config.dotScore;
  }

  #resetRoundState(): void {
    this.#dots = new Set(this.maze.dotTiles.map(positionKey));
    this.#player = createActor(this.maze.spawn);
    this.#ball = null;
    this.#revealedLetters = [];
    this.#wrongLetters = [];
    this.#lastGuess = null;
    this.#resumeRemainingMs = 0;
    this.#activeTimeMs = 0;
  }
}

function actorSnapshot(actor: Actor): ActorSnapshot {
  return {
    x: actor.x,
    y: actor.y,
    direction: actor.direction,
    pendingDirection: actor.pendingDirection,
  };
}
