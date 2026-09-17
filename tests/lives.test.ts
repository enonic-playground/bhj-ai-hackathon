import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { Game } from '../src/game/game.js';
import { positionKey } from '../src/game/maze.js';
import {
  arenaEnemy,
  arenaMaze,
  ballAt,
  createTestGame,
  placeEnemyOnPlayer,
  placePlayer,
  runForMs,
  runUntil,
  steerPlayerTo,
  STEP_SECONDS,
} from './fixtures.js';

const ALL_IDS = ['chaser', 'ambusher', 'patroller', 'prowler'] as const;
const PELLET = { col: 1, row: 1 };

function livesGame(options: Parameters<typeof createTestGame>[1] = {}): Game {
  const game = createTestGame(arenaMaze(), {
    // Most of these checks are about the arcade state rather than the ball, so
    // the maze runs without one unless a check asks for it.
    selectBallSpawn: () => null,
    enemies: ALL_IDS.map((kind) => arenaEnemy(kind, { releaseDelayMs: 10 * 60 * 1000 })),
    ...options,
  });
  game.startLevel();
  return game;
}

/** Walks into a lethal enemy on the next slice and waits out the presentation. */
function dieOnce(game: Game): void {
  // A frightened enemy would be eaten instead, so the effect is let run out.
  runUntil(game, () => game.snapshot().frightenedRemainingMs === 0, 8000);
  placeEnemyOnPlayer(game, 'chaser', 'roaming');
  game.step(STEP_SECONDS);
  expect(game.status).toBe('dying');
  // Exactly the presentation: the respawn happens on the last of those slices,
  // so no chase time has run yet when the caller reads the reset state.
  runForMs(game, DEFAULT_CONFIG.dyingPresentationMs);
}

describe('lives and death', () => {
  it('starts a run with three lives', () => {
    const game = livesGame();
    expect(DEFAULT_CONFIG.startingLives).toBe(3);
    expect(game.lives).toBe(3);
    expect(game.snapshot().lives).toBe(3);
  });

  it('takes one life, freezes the maze, then returns to the chase', () => {
    const game = livesGame();
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);

    expect(game.status).toBe('dying');
    expect(game.lives).toBe(2);
    expect(game.snapshot().dyingRemainingMs).toBeCloseTo(DEFAULT_CONFIG.dyingPresentationMs, 6);

    // The presentation runs its own timer and nothing else.
    runForMs(game, 700);
    expect(game.status).toBe('dying');
    runForMs(game, 100);
    expect(game.status).toBe('chase');
    expect(game.snapshot().dyingRemainingMs).toBe(0);
  });

  it('ignores gameplay input for the whole death presentation', () => {
    const game = livesGame();
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);

    expect(game.requestDirection('left')).toBe(false);
    expect(game.guess('A').outcome).toBe('ignored');
    expect(game.player.pendingDirection).toBeNull();
  });

  it('keeps score, word, guesses and collectibles across a death', () => {
    const game = livesGame();
    steerPlayerTo(game, PELLET);

    const before = game.snapshot();
    expect(before.score).toBeGreaterThan(0);
    dieOnce(game);
    const after = game.snapshot();

    expect(after.score).toBe(before.score);
    expect(after.dotsRemaining).toBe(before.dotsRemaining);
    expect(after.pelletsRemaining).toBe(before.pelletsRemaining);
    expect(after.word).toEqual(before.word);
    expect(after.lives).toBe(before.lives - 1);
  });

  it('resets actors, timers and the score chain, and grants protection', () => {
    const game = livesGame();
    steerPlayerTo(game, PELLET);
    // Eat one enemy so both the effect and the score chain are mid-flight.
    placeEnemyOnPlayer(game, 'ambusher', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.snapshot().enemiesEaten).toBe(1);

    dieOnce(game);
    const after = game.snapshot();

    expect(positionKey(game.maze.spawn)).toBe(positionKey({ col: after.player.x, row: after.player.y }));
    expect(after.player.direction).toBeNull();
    expect(after.player.pendingDirection).toBeNull();
    expect(after.frightenedRemainingMs).toBe(0);
    expect(after.enemiesEaten).toBe(0);
    expect(after.enemyPhase).toBe('scatter');
    expect(after.phaseRemainingMs).toBeCloseTo(DEFAULT_CONFIG.scatterPhaseMs, 6);
    expect(after.protectionRemainingMs).toBeCloseTo(DEFAULT_CONFIG.protectionMs, 6);
    for (const enemy of after.enemies) {
      expect(enemy.state).toBe('home');
    }
  });

  it('spawns the replacement ball by the safe-spawn rule', () => {
    // A pinned spawn would prove nothing here: the real distance rule places it.
    const game = livesGame({ selectBallSpawn: ballAt({ col: 9, row: 6 }) });
    game.startLevel();
    dieOnce(game);
    const ball = game.snapshot().ball;
    if (!ball) throw new Error('a ball must be respawned');
    expect(Math.hypot(ball.x - game.player.x, ball.y - game.player.y)).toBeGreaterThan(0);
  });

  it('ignores lethal contacts while protected, but still allows collection', () => {
    const game = livesGame();
    dieOnce(game);
    expect(game.snapshot().protectionRemainingMs).toBeGreaterThan(0);

    const lives = game.lives;
    const score = game.score;
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    runForMs(game, 200);
    expect(game.status).toBe('chase');
    expect(game.lives).toBe(lives);

    // Dots keep scoring while protected: only the lethal contact is ignored.
    steerPlayerTo(game, { col: 4, row: 6 });
    expect(game.score).toBeGreaterThan(score);
  });

  it('still eats a frightened enemy while protected', () => {
    const game = livesGame();
    dieOnce(game);
    steerPlayerTo(game, PELLET);
    expect(game.snapshot().protectionRemainingMs).toBeGreaterThan(0);

    const score = game.score;
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.score).toBe(score + 200);
  });

  it('counts protection in active chase seconds only', () => {
    const game = livesGame();
    dieOnce(game);
    runForMs(game, 500);
    const parked = game.snapshot().protectionRemainingMs;

    game.pause();
    runForMs(game, 3000);
    expect(game.snapshot().protectionRemainingMs).toBe(parked);
    game.resume();

    runForMs(game, 1600);
    expect(game.snapshot().protectionRemainingMs).toBe(0);
  });
});

describe('game over and restart', () => {
  it('reveals the word and freezes everything at zero lives', () => {
    const game = livesGame();
    dieOnce(game);
    runUntil(game, () => game.snapshot().protectionRemainingMs === 0, 4000);
    dieOnce(game);
    runUntil(game, () => game.snapshot().protectionRemainingMs === 0, 4000);

    expect(game.lives).toBe(1);
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');
    expect(game.lives).toBe(0);

    runForMs(game, DEFAULT_CONFIG.dyingPresentationMs + 100);
    expect(game.status).toBe('game-over');
    expect(game.snapshot().word.answer).toBe('APPLE');

    // Nothing moves and nothing scores from here.
    const over = game.snapshot();
    expect(game.requestDirection('left')).toBe(false);
    expect(game.guess('A').outcome).toBe('ignored');
    runForMs(game, 2000);
    expect(game.snapshot()).toEqual(over);
  });

  it('makes a restart a completely fresh three-life run', () => {
    const game = livesGame({ selectBallSpawn: ballAt({ col: 9, row: 6 }) });
    // Dirty every piece of run state first: a lost life, a spent pellet, a
    // running effect, an eaten enemy and protection still counting down.
    dieOnce(game);
    expect(game.lives).toBe(2);
    steerPlayerTo(game, PELLET);
    placeEnemyOnPlayer(game, 'ambusher', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.snapshot().enemiesEaten).toBe(1);

    game.startLevel();
    const fresh = game.snapshot();
    expect(fresh.status).toBe('chase');
    expect(fresh.lives).toBe(DEFAULT_CONFIG.startingLives);
    expect(fresh.score).toBe(0);
    expect(fresh.dotsRemaining).toBe(game.maze.dotTiles.length);
    expect(fresh.pelletsRemaining).toBe(game.maze.powerPelletTiles.length);
    expect(fresh.protectionRemainingMs).toBe(0);
    expect(fresh.dyingRemainingMs).toBe(0);
    expect(fresh.frightenedRemainingMs).toBe(0);
    expect(fresh.enemiesEaten).toBe(0);
    expect(fresh.enemyPhase).toBe('scatter');
    expect(fresh.pausedFrom).toBeNull();
    expect(fresh.word.wrongLetters).toEqual([]);
    expect(fresh.word.revealedLetters).toEqual([]);
    expect(fresh.ball).not.toBeNull();
    for (const enemy of fresh.enemies) {
      expect(enemy.state).toBe('home');
      expect(enemy.waitRemainingMs).toBe(10 * 60 * 1000);
    }
  });

  it('restarts cleanly from a pause as well', () => {
    const game = livesGame();
    runForMs(game, 500);
    game.pause('manual');
    expect(game.status).toBe('paused');

    game.startLevel();
    expect(game.status).toBe('chase');
    expect(game.snapshot().pausedFrom).toBeNull();
    expect(game.snapshot().pauseReason).toBeNull();
  });

  it('keeps solving the word as the only win, whatever the enemies are doing', () => {
    const game = livesGame({ selectBallSpawn: ballAt({ col: 9, row: 6 }) });
    placePlayer(game, { col: 9, row: 6 });
    runUntil(game, () => game.status === 'guess', 5000);

    for (const letter of ['A', 'P', 'L', 'E']) {
      game.guess(letter);
    }
    expect(game.status).toBe('level-complete');
    expect(game.snapshot().word.answer).toBe('APPLE');
    // Dots, pellets and enemies had nothing to do with it.
    expect(game.dotsRemaining).toBeGreaterThan(0);
    expect(game.pelletsRemaining).toBeGreaterThan(0);
  });

  it('never costs a life for a wrong letter', () => {
    const game = livesGame({ selectBallSpawn: ballAt({ col: 9, row: 6 }) });
    placePlayer(game, { col: 9, row: 6 });
    runUntil(game, () => game.status === 'guess', 5000);

    const lives = game.lives;
    expect(game.guess('Z').outcome).toBe('wrong');
    expect(game.lives).toBe(lives);
    expect(game.status).toBe('resuming');
  });
});
