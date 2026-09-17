import { advanceActor, createActor, type Actor } from './actor.js';
import { actorSeparation, advanceBall, createBall, isCaptured } from './ball.js';
import {
  DEFAULT_CONFIG,
  fastestSpeedFactor,
  type EnemyDefinition,
  type GameConfig,
} from './config.js';
import { oppositeDirection, type Direction } from './direction.js';
import {
  applyArrival,
  chooseFrightenedDirection,
  chooseTargetedDirection,
  createEnemy,
  enemyTarget,
  isEdible,
  isLethal,
  speedFactorFor,
  traversalFor,
  type Enemy,
  type EnemyPhase,
  type EnemyState,
} from './enemy.js';
import { createLevelOneMaze } from './mazeData.js';
import {
  neighbor,
  positionKey,
  reachableFrom,
  type GridPosition,
  type Maze,
} from './maze.js';
import { DistanceCache } from './paths.js';
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
 * Every application state the one-level game uses. `resuming` is the countdown
 * after a wrong letter, `dying` the death presentation, and `paused` retains
 * whichever of the active states it interrupted. CAMPAIGN_COMPLETE arrives with
 * the campaign in M4.
 */
export type GameStatus =
  | 'title'
  | 'chase'
  | 'guess'
  | 'resuming'
  | 'paused'
  | 'dying'
  | 'level-complete'
  | 'game-over';

/** States that a pause may interrupt, and that an explicit resume restores. */
const PAUSABLE_STATUSES: readonly GameStatus[] = ['chase', 'guess', 'resuming', 'dying'];

/** Why the game is paused; only the wording of the overlay depends on it. */
export type PauseReason = 'manual' | 'away';

/** Rounding slack for every countdown, far below anything a player can perceive. */
const TIMER_EPSILON_MS = 1e-6;

export class EnemyConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnemyConfigError';
  }
}

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

export interface EnemySnapshot extends ActorSnapshot {
  readonly id: string;
  readonly name: string;
  readonly state: EnemyState;
  /** True while this enemy can be eaten rather than kill. */
  readonly edible: boolean;
  /** True while contact with this enemy costs a life. */
  readonly lethal: boolean;
  /** Remaining release or post-return wait, in milliseconds. */
  readonly waitRemainingMs: number;
}

export interface WordSnapshot {
  readonly category: string;
  readonly length: number;
  /** Hidden positions are null, so the readout never leaks the answer. */
  readonly mask: readonly (string | null)[];
  readonly revealedLetters: readonly string[];
  readonly wrongLetters: readonly string[];
  readonly solved: boolean;
  /** The word itself, only once the round is over one way or the other. */
  readonly answer: string | null;
}

export interface GameSnapshot {
  readonly status: GameStatus;
  /** The state a pause interrupted, or null when the game is not paused. */
  readonly pausedFrom: GameStatus | null;
  readonly pauseReason: PauseReason | null;
  readonly level: number;
  readonly score: number;
  readonly lives: number;
  readonly dotsRemaining: number;
  readonly pelletsRemaining: number;
  readonly player: ActorSnapshot;
  /** Absent while the player is guessing or the round is over. */
  readonly ball: ActorSnapshot | null;
  readonly enemies: readonly EnemySnapshot[];
  readonly enemyPhase: EnemyPhase;
  readonly phaseRemainingMs: number;
  readonly frightenedRemainingMs: number;
  /** Enemies eaten so far within the current frightened effect. */
  readonly enemiesEaten: number;
  readonly protectionRemainingMs: number;
  readonly dyingRemainingMs: number;
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
  /** Injected for reproducible spawns, ball decisions and frightened movement. */
  readonly random?: RandomSource;
  /** Injected word selection; tests and fixtures pin a known word. */
  readonly selectWord?: (random: RandomSource) => WordEntry;
  /** Injected ball placement; defaults to the PRD's distance rule. */
  readonly selectBallSpawn?: BallSpawnSelector;
  /** Replaces the configured enemy set; an empty list runs the maze with none. */
  readonly enemies?: readonly EnemyDefinition[];
}

/**
 * Owns all round state and advances it in fixed steps. It has no knowledge of
 * canvas, DOM, input events or animation scheduling, so tests can drive it
 * directly. Every state change goes through one of the private transitions
 * below, so a repeated event cannot respawn a ball, award a bonus twice or
 * take two lives for one death.
 */
export class Game {
  readonly maze: Maze;
  readonly config: GameConfig;

  readonly #random: RandomSource;
  readonly #selectWord: (random: RandomSource) => WordEntry;
  readonly #selectBallSpawn: BallSpawnSelector;
  readonly #enemyDefinitions: readonly EnemyDefinition[];
  readonly #distances: DistanceCache;

  #status: GameStatus = 'title';
  #pausedFrom: GameStatus | null = null;
  #pauseReason: PauseReason | null = null;
  #level = 1;
  #score = 0;
  #lives: number;
  #dots = new Set<string>();
  #pellets = new Set<string>();
  #player: Actor;
  #ball: Actor | null = null;
  #enemies: Enemy[] = [];
  #phase: EnemyPhase = 'scatter';
  #phaseRemainingMs = 0;
  #frightenedRemainingMs = 0;
  #enemiesEaten = 0;
  #protectionRemainingMs = 0;
  #dyingRemainingMs = 0;
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
    this.#enemyDefinitions = validateEnemyDefinitions(maze, options.enemies ?? config.enemies);
    this.#distances = new DistanceCache(maze);
    this.#lives = config.startingLives;
    this.#player = createActor(maze.spawn);
    this.#word = validateWordEntry(this.#selectWord(this.#random));
    this.#resetRoundState();
  }

  get status(): GameStatus {
    return this.#status;
  }

  /** The state a pause interrupted, or null when the game is not paused. */
  get pausedFrom(): GameStatus | null {
    return this.#pausedFrom;
  }

  get pauseReason(): PauseReason | null {
    return this.#pauseReason;
  }

  get score(): number {
    return this.#score;
  }

  get level(): number {
    return this.#level;
  }

  get lives(): number {
    return this.#lives;
  }

  get player(): Actor {
    return this.#player;
  }

  /** The ball, or null while guessing, on the title screen or after a solve. */
  get ball(): Actor | null {
    return this.#ball;
  }

  get enemies(): readonly Enemy[] {
    return this.#enemies;
  }

  get enemyPhase(): EnemyPhase {
    return this.#phase;
  }

  get frightenedRemainingMs(): number {
    return this.#frightenedRemainingMs;
  }

  get protectionRemainingMs(): number {
    return this.#protectionRemainingMs;
  }

  get dyingRemainingMs(): number {
    return this.#dyingRemainingMs;
  }

  get dotsRemaining(): number {
    return this.#dots.size;
  }

  get pelletsRemaining(): number {
    return this.#pellets.size;
  }

  get activeTimeMs(): number {
    return this.#activeTimeMs;
  }

  get resumeRemainingMs(): number {
    return this.#resumeRemainingMs;
  }

  /** True while the maze simulation is not advancing under the player's control. */
  get isFrozen(): boolean {
    return this.#status !== 'chase' && this.#status !== 'title';
  }

  hasDot(position: GridPosition): boolean {
    return this.#dots.has(positionKey(position));
  }

  hasPowerPellet(position: GridPosition): boolean {
    return this.#pellets.has(positionKey(position));
  }

  /** Every dot still on the board, for rendering. */
  remainingDots(): GridPosition[] {
    return this.maze.dotTiles.filter((dot) => this.hasDot(dot));
  }

  /** Every power pellet still on the board, for rendering. */
  remainingPowerPellets(): GridPosition[] {
    return this.maze.powerPelletTiles.filter((pellet) => this.hasPowerPellet(pellet));
  }

  /** Leaves the title screen and starts a fresh run; also drives Play again and Restart run. */
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
    this.#pausedFrom = null;
    this.#pauseReason = null;
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
   * Freezes an active state and remembers it. A second pause — a repeated blur,
   * a visibility change on top of a manual pause — is refused, so the retained
   * state can never be overwritten with PAUSED itself.
   */
  pause(reason: PauseReason = 'manual'): boolean {
    if (!PAUSABLE_STATUSES.includes(this.#status)) {
      return false;
    }
    this.#pausedFrom = this.#status;
    this.#pauseReason = reason;
    this.#status = 'paused';
    this.clearInput();
    return true;
  }

  /**
   * Restores the exact state the pause interrupted, with every timer where it
   * was. Only a deliberate call does this: regaining focus or visibility never
   * resumes on its own.
   */
  resume(): boolean {
    const previous = this.#pausedFrom;
    if (this.#status !== 'paused' || !previous) {
      return false;
    }
    this.#status = previous;
    this.#pausedFrom = null;
    this.#pauseReason = null;
    this.clearInput();
    return true;
  }

  /**
   * Applies a letter guess. Only `guess` accepts them, so a stray key or click
   * during the chase, a pause, the countdown or a result panel changes nothing.
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

  /** Drops queued input, for context changes such as a pause or a death. */
  clearInput(): void {
    this.#player.pendingDirection = null;
  }

  /**
   * Advances the simulation by one fixed step of `stepSeconds`.
   *
   * Only CHASE moves the maze. The countdown and the death presentation each
   * advance nothing but their own timer, and every other state — guessing,
   * paused, the title screen and both end panels — advances nothing at all.
   */
  step(stepSeconds: number): void {
    if (!(stepSeconds > 0)) {
      return;
    }
    if (this.#status === 'resuming') {
      this.#advanceCountdown(stepSeconds);
      return;
    }
    if (this.#status === 'dying') {
      this.#advanceDying(stepSeconds);
      return;
    }
    if (this.#status !== 'chase') {
      return;
    }

    // Contact is tested after every bounded substep, so however long the
    // caller's step is, no two actors can swap sides without touching. The
    // bound is taken from the fastest actor in the game, which is an enemy on
    // its way home rather than the player.
    const reach = this.config.playerSpeedTilesPerSecond * stepSeconds * fastestSpeedFactor(this.config);
    const substeps = Math.max(1, Math.ceil(reach / this.config.maxSubstepTiles));

    for (let index = 0; index < substeps; index += 1) {
      if (this.#status !== 'chase') {
        return; // A capture or a death inside this step ends the chase at once.
      }
      this.#substep(stepSeconds / substeps);
    }
  }

  /**
   * One bounded slice of chase simulation, in the order PRD section 4 fixes:
   * timers, then legal movement for every actor, then collectibles reached,
   * then enemy contacts, then ball capture if the player is still alive.
   *
   * Timers run first, so the slice in which frightened time reaches zero already
   * treats the enemies as lethal, and the slice in which a release timer reaches
   * zero already moves that enemy. Collectibles run before contacts, so a pellet
   * reached on this slice protects the player from the enemy standing on it.
   */
  #substep(stepSeconds: number): void {
    const distance = this.config.playerSpeedTilesPerSecond * stepSeconds;

    this.#advanceTimers(stepSeconds);

    const centresReached = advanceActor(this.maze, this.#player, distance);
    this.#moveEnemies(stepSeconds);
    if (this.#ball) {
      advanceBall(this.maze, this.#ball, distance * this.config.ballSpeedFactor, this.#random);
    }

    for (const centre of centresReached) {
      this.#collect(centre);
    }

    if (this.#resolveEnemyContacts()) {
      return; // Death ends this slice: nothing may leak into the frozen state.
    }
    if (this.#ball && isCaptured(this.maze, this.#player, this.#ball, this.config.captureRadiusTiles)) {
      this.#enterGuess();
    }
  }

  /** Advances every CHASE-only timer: animation, protection, phases and home waits. */
  #advanceTimers(stepSeconds: number): void {
    const elapsedMs = stepSeconds * 1000;
    this.#activeTimeMs += elapsedMs;

    if (this.#protectionRemainingMs > 0) {
      this.#protectionRemainingMs = Math.max(0, this.#protectionRemainingMs - elapsedMs);
    }

    if (this.#frightenedRemainingMs > 0) {
      // The chase/scatter clock is frozen for as long as the effect lasts, and
      // picks up its remaining time again the moment the effect ends.
      this.#frightenedRemainingMs -= elapsedMs;
      if (this.#frightenedRemainingMs <= TIMER_EPSILON_MS) {
        this.#frightenedRemainingMs = 0;
      }
    } else {
      this.#phaseRemainingMs -= elapsedMs;
      if (this.#phaseRemainingMs <= TIMER_EPSILON_MS) {
        this.#flipPhase();
      }
    }

    for (const enemy of this.#enemies) {
      if (enemy.state !== 'home' && enemy.state !== 'resting') continue;
      enemy.waitRemainingMs -= elapsedMs;
      if (enemy.waitRemainingMs <= TIMER_EPSILON_MS) {
        enemy.waitRemainingMs = 0;
        enemy.state = 'exiting';
      }
    }
  }

  /**
   * Switches between scatter and chase, carrying any overshoot into the new
   * phase so the cycle does not drift. Every roaming enemy is asked to reverse:
   * that is the documented mode transition the no-reversal rule allows.
   */
  #flipPhase(): void {
    const overshoot = Math.min(0, this.#phaseRemainingMs);
    this.#phase = this.#phase === 'scatter' ? 'chase' : 'scatter';
    this.#phaseRemainingMs =
      (this.#phase === 'scatter' ? this.config.scatterPhaseMs : this.config.chasePhaseMs) + overshoot;
    this.#requestReversals();
  }

  #requestReversals(): void {
    for (const enemy of this.#enemies) {
      if (enemy.state === 'roaming') {
        enemy.reverseRequested = true;
      }
    }
  }

  #moveEnemies(stepSeconds: number): void {
    for (const enemy of this.#enemies) {
      if (enemy.state === 'home' || enemy.state === 'resting') {
        continue; // Waiting enemies hold their slot; only their timer moves.
      }
      const factor = speedFactorFor(enemy, this.#frightenedRemainingMs, this.config);
      const distance = this.config.playerSpeedTilesPerSecond * stepSeconds * factor;
      advanceActor(this.maze, enemy.actor, distance, {
        // The permission is taken from the state the enemy is in when the move
        // starts. `home` is a superset of `maze`, so an enemy that joins play
        // part-way through this move is still judged against legal tiles only.
        traversal: traversalFor(enemy.state),
        chooseDirection: (tile, actor) => this.#chooseEnemyDirection(enemy, tile, actor),
      });
    }
  }

  /** The turn an enemy takes from the tile centre it has just reached. */
  #chooseEnemyDirection(enemy: Enemy, tile: GridPosition, actor: Actor): Direction | null {
    applyArrival(enemy, tile, this.maze, this.config.homeWaitMs);
    if (enemy.state === 'home' || enemy.state === 'resting') {
      return null; // Arrived home: stop here until the wait runs out.
    }

    const traversal = traversalFor(enemy.state);
    if (enemy.reverseRequested) {
      enemy.reverseRequested = false;
      const back = actor.direction ? oppositeDirection(actor.direction) : null;
      if (back && neighbor(this.maze, tile, back, traversal)) {
        return back;
      }
    }

    const home = this.maze.home;
    if (home && enemy.state === 'exiting') {
      return chooseTargetedDirection(
        this.maze,
        tile,
        actor.direction,
        home.exit,
        traversal,
        this.#distances,
      );
    }
    if (home && enemy.state === 'returning') {
      return chooseTargetedDirection(
        this.maze,
        tile,
        actor.direction,
        home.rest,
        traversal,
        this.#distances,
      );
    }
    if (this.#frightenedRemainingMs > 0) {
      return chooseFrightenedDirection(this.maze, tile, actor.direction, this.#random);
    }

    const target = enemyTarget(enemy, {
      maze: this.maze,
      player: this.#player,
      phase: this.#phase,
      distances: this.#distances,
      config: this.config,
    });
    return chooseTargetedDirection(this.maze, tile, actor.direction, target, traversal, this.#distances);
  }

  /**
   * Resolves every enemy the player is touching on this slice. Returns true
   * when the player died, which ends the slice.
   *
   * Whether the slice is lethal is decided before any eat is awarded, so
   * running into a lethal enemy and a frightened one at the same moment costs a
   * life and scores nothing. Several lethal contacts still cost exactly one
   * life, and an eaten enemy leaves the edible set immediately, so one contact
   * can never score twice.
   */
  #resolveEnemyContacts(): boolean {
    if (this.#enemies.length === 0) {
      return false;
    }
    const frightened = this.#frightenedRemainingMs;
    const radius = this.config.enemyContactRadiusTiles;
    const touching = this.#enemies.filter(
      (enemy) =>
        (isLethal(enemy, frightened) || isEdible(enemy, frightened)) &&
        actorSeparation(this.maze, this.#player, enemy.actor) <= radius,
    );
    if (touching.length === 0) {
      return false;
    }

    const lethal = touching.some((enemy) => isLethal(enemy, frightened));
    if (lethal && this.#protectionRemainingMs <= 0) {
      this.#die();
      return true;
    }
    // Protection ignores a lethal contact, but not an edible one: a shielded
    // player still eats a frightened enemy.
    for (const enemy of touching) {
      if (isEdible(enemy, frightened)) {
        this.#eatEnemy(enemy);
      }
    }
    return false;
  }

  #eatEnemy(enemy: Enemy): void {
    const scores = this.config.enemyEatScores;
    const index = Math.min(this.#enemiesEaten, scores.length - 1);
    this.#score += scores[index] ?? 0;
    this.#enemiesEaten += 1;
    enemy.state = 'returning';
    // Turning round is the documented transition that lets it head home at once.
    enemy.reverseRequested = true;
  }

  snapshot(): GameSnapshot {
    const revealed = this.#revealedSet();
    const solved = isWordSolved(this.#word.word, revealed);
    const roundOver = this.#status === 'level-complete' || this.#status === 'game-over';
    return {
      status: this.#status,
      pausedFrom: this.#pausedFrom,
      pauseReason: this.#pauseReason,
      level: this.#level,
      score: this.#score,
      lives: this.#lives,
      dotsRemaining: this.#dots.size,
      pelletsRemaining: this.#pellets.size,
      player: actorSnapshot(this.#player),
      ball: this.#ball ? actorSnapshot(this.#ball) : null,
      enemies: this.#enemies.map((enemy) => ({
        ...actorSnapshot(enemy.actor),
        id: enemy.definition.id,
        name: enemy.definition.name,
        state: enemy.state,
        edible: isEdible(enemy, this.#frightenedRemainingMs),
        lethal: isLethal(enemy, this.#frightenedRemainingMs),
        waitRemainingMs: enemy.waitRemainingMs,
      })),
      enemyPhase: this.#phase,
      phaseRemainingMs: this.#phaseRemainingMs,
      frightenedRemainingMs: this.#frightenedRemainingMs,
      enemiesEaten: this.#enemiesEaten,
      protectionRemainingMs: this.#protectionRemainingMs,
      dyingRemainingMs: this.#dyingRemainingMs,
      word: {
        category: this.#word.category,
        length: this.#word.word.length,
        mask: maskWord(this.#word.word, revealed),
        revealedLetters: [...this.#revealedLetters],
        wrongLetters: [...this.#wrongLetters],
        solved,
        answer: roundOver ? this.#word.word : null,
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
    if (this.#resumeRemainingMs > TIMER_EPSILON_MS) {
      return;
    }
    this.#resumeRemainingMs = 0;
    this.#status = 'chase';
    // Anything held or queued during the countdown is dropped on the way out.
    this.clearInput();
  }

  /** Lethal contact: take exactly one life and freeze everything but the presentation. */
  #die(): void {
    if (this.#status !== 'chase') {
      return;
    }
    this.#lives -= 1;
    this.#status = 'dying';
    this.#dyingRemainingMs = this.config.dyingPresentationMs;
    this.clearInput();
  }

  #advanceDying(stepSeconds: number): void {
    this.#dyingRemainingMs -= stepSeconds * 1000;
    if (this.#dyingRemainingMs > TIMER_EPSILON_MS) {
      return;
    }
    this.#dyingRemainingMs = 0;
    if (this.#lives > 0) {
      this.#respawnAfterDeath();
      return;
    }
    this.#status = 'game-over';
    this.clearInput();
  }

  /**
   * Returns the actors to their starts and grants protection. Score, word,
   * guesses and every collected dot and pellet survive: only the arcade timers
   * and the actors are reset.
   */
  #respawnAfterDeath(): void {
    this.#player = createActor(this.maze.spawn);
    this.#resetEnemies();
    this.#frightenedRemainingMs = 0;
    this.#enemiesEaten = 0;
    this.#protectionRemainingMs = this.config.protectionMs;
    this.#spawnBall();
    this.#status = 'chase';
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

  /** Resolves one tile centre the player reached: a dot, a pellet, or nothing. */
  #collect(position: GridPosition): void {
    const key = positionKey(position);
    if (this.#dots.delete(key)) {
      this.#score += this.config.dotScore;
      return; // A tile carries a dot or a pellet, never both, and scores once.
    }
    if (this.#pellets.delete(key)) {
      this.#score += this.config.powerPelletScore;
      this.#startFrightened();
    }
  }

  /** A pellet refreshes the effect rather than stacking it, and restarts the chain. */
  #startFrightened(): void {
    this.#frightenedRemainingMs = this.config.frightenedMs;
    this.#enemiesEaten = 0;
    this.#requestReversals();
  }

  #resetEnemies(): void {
    this.#enemies = this.#enemyDefinitions.map((definition, index) => {
      const slot = this.maze.home?.spawns[index] ?? this.maze.spawn;
      return createEnemy(definition, slot);
    });
    this.#phase = 'scatter';
    this.#phaseRemainingMs = this.config.scatterPhaseMs;
  }

  #resetRoundState(): void {
    this.#dots = new Set(this.maze.dotTiles.map(positionKey));
    this.#pellets = new Set(this.maze.powerPelletTiles.map(positionKey));
    this.#player = createActor(this.maze.spawn);
    this.#ball = null;
    this.#lives = this.config.startingLives;
    this.#resetEnemies();
    this.#frightenedRemainingMs = 0;
    this.#enemiesEaten = 0;
    this.#protectionRemainingMs = 0;
    this.#dyingRemainingMs = 0;
    this.#pausedFrom = null;
    this.#pauseReason = null;
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

/**
 * Rejects an enemy set the maze cannot carry, before a round can start: too
 * many enemies for the authored start slots, a scatter corner or patrol
 * waypoint the roaming graph never reaches, or a patroller with no circuit.
 *
 * A maze that authors no enemy home simply carries no enemies, which is what
 * the small movement and ball fixtures rely on.
 */
function validateEnemyDefinitions(
  maze: Maze,
  definitions: readonly EnemyDefinition[],
): readonly EnemyDefinition[] {
  const home = maze.home;
  if (!home) {
    return [];
  }
  if (definitions.length > home.spawns.length) {
    throw new EnemyConfigError(
      `the maze has ${home.spawns.length} enemy start slots but ${definitions.length} enemies are configured`,
    );
  }

  const reachable = reachableFrom(maze, maze.spawn);
  for (const definition of definitions) {
    if (!reachable.has(positionKey(definition.scatterTarget))) {
      throw new EnemyConfigError(
        `enemy ${definition.id} scatters to an unreachable tile at row ${definition.scatterTarget.row}, column ${definition.scatterTarget.col}`,
      );
    }
    if (definition.kind === 'patroller' && definition.patrolWaypoints.length === 0) {
      throw new EnemyConfigError(`enemy ${definition.id} patrols without any waypoint`);
    }
    for (const waypoint of definition.patrolWaypoints) {
      if (!reachable.has(positionKey(waypoint))) {
        throw new EnemyConfigError(
          `enemy ${definition.id} patrols to an unreachable tile at row ${waypoint.row}, column ${waypoint.col}`,
        );
      }
    }
  }
  return definitions;
}
