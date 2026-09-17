import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { Game, type GameStatus } from '../src/game/game.js';
import { handleGameKey, handlePauseKey, PAUSE_KEY } from '../src/input/inputRouter.js';
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
const BALL = { col: 9, row: 6 };

function pauseGame(options: Parameters<typeof createTestGame>[1] = {}): Game {
  const game = createTestGame(arenaMaze(), {
    selectBallSpawn: ballAt(BALL),
    enemies: ALL_IDS.map((kind) => arenaEnemy(kind)),
    ...options,
  });
  game.startLevel();
  return game;
}

/** Brings a round to each of the four states a pause has to be able to hold. */
function reach(status: Exclude<GameStatus, 'title' | 'paused' | 'level-complete' | 'game-over'>): Game {
  const game = pauseGame();
  if (status === 'chase') {
    runForMs(game, 300);
    return game;
  }
  if (status === 'dying') {
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    return game;
  }
  placePlayer(game, BALL);
  runUntil(game, () => game.status === 'guess', 5000);
  if (status === 'resuming') {
    expect(game.guess('Z').outcome).toBe('wrong');
  }
  return game;
}

describe('pause and resume', () => {
  it('pauses and restores each active state exactly', () => {
    for (const status of ['chase', 'guess', 'resuming', 'dying'] as const) {
      const game = reach(status);
      expect(game.status).toBe(status);
      const before = game.snapshot();

      expect(game.pause('manual')).toBe(true);
      expect(game.status).toBe('paused');
      expect(game.snapshot().pausedFrom).toBe(status);
      expect(game.snapshot().pauseReason).toBe('manual');

      expect(game.resume()).toBe(true);
      const after = game.snapshot();
      expect(after.status).toBe(status);
      expect(after.pausedFrom).toBeNull();
      // Everything but the queued input, which a pause always clears, is where
      // it was: guessing is still guessing, and a countdown keeps its time.
      expect({ ...after, player: { ...after.player, pendingDirection: null } }).toEqual({
        ...before,
        player: { ...before.player, pendingDirection: null },
      });
    }
  });

  it('freezes every timer, actor and animation while paused', () => {
    const game = pauseGame();
    steerPlayerTo(game, { col: 1, row: 1 });
    runForMs(game, 400);
    game.pause('manual');

    const parked = game.snapshot();
    const activeTime = game.activeTimeMs;
    runForMs(game, 10_000);

    expect(game.snapshot()).toEqual(parked);
    expect(game.activeTimeMs).toBe(activeTime);
  });

  it('ignores gameplay input while paused', () => {
    const game = reach('chase');
    game.pause('manual');
    expect(game.requestDirection('left')).toBe(false);
    expect(game.guess('A').outcome).toBe('ignored');
    expect(handleGameKey(game, 'ArrowLeft').owned).toBe(false);
    expect(handleGameKey(game, 'a').owned).toBe(false);
    expect(game.player.pendingDirection).toBeNull();
  });

  it('refuses to pause a state that is not in play', () => {
    const title = pauseGame();
    title.returnToTitle();
    expect(title.pause('away')).toBe(false);
    expect(title.status).toBe('title');

    const solved = reach('guess');
    for (const letter of ['A', 'P', 'L', 'E']) solved.guess(letter);
    expect(solved.status).toBe('level-complete');
    expect(solved.pause('manual')).toBe(false);
    expect(solved.status).toBe('level-complete');
  });

  it('never overwrites the retained state with a second pause', () => {
    const game = reach('guess');
    expect(game.pause('manual')).toBe(true);

    // The repeated blur and visibility events a real browser delivers.
    expect(game.pause('away')).toBe(false);
    expect(game.pause('away')).toBe(false);
    expect(game.pause('manual')).toBe(false);

    expect(game.snapshot().pausedFrom).toBe('guess');
    expect(game.snapshot().pauseReason).toBe('manual');
    game.resume();
    expect(game.status).toBe('guess');
  });

  it('only resumes from a pause, and only once', () => {
    const game = reach('chase');
    expect(game.resume()).toBe(false); // Not paused: nothing to restore.
    game.pause('away');
    expect(game.resume()).toBe(true);
    expect(game.resume()).toBe(false);
    expect(game.status).toBe('chase');
  });

  it('keeps a countdown with under 100 ms left intact across a pause', () => {
    const game = reach('resuming');
    runUntil(game, () => game.resumeRemainingMs <= 100, 4000);
    const remaining = game.resumeRemainingMs;
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(100);

    game.pause('away');
    runForMs(game, 5000);
    expect(game.resumeRemainingMs).toBe(remaining);
    expect(game.status).toBe('paused');

    // Resuming replays none of the pause: the countdown runs out on exactly
    // the time it had left, rather than being finished by the return itself.
    game.resume();
    expect(game.status).toBe('resuming');
    runForMs(game, remaining - DEFAULT_CONFIG.simulationStepMs);
    expect(game.status).toBe('resuming');
    runForMs(game, 2 * DEFAULT_CONFIG.simulationStepMs);
    expect(game.resumeRemainingMs).toBe(0);
    // Back in the maze; the respawned ball sits on the player here, so the
    // very next slice legitimately catches it again.
    expect(game.status).not.toBe('resuming');
  });

  it('keeps a death presentation running for its remaining time', () => {
    const game = reach('dying');
    runForMs(game, 300);
    const remaining = game.snapshot().dyingRemainingMs;

    game.pause('away');
    runForMs(game, 5000);
    expect(game.snapshot().dyingRemainingMs).toBe(remaining);

    game.resume();
    expect(game.status).toBe('dying');
    runForMs(game, remaining - DEFAULT_CONFIG.simulationStepMs);
    expect(game.status).toBe('dying');
    runForMs(game, 2 * DEFAULT_CONFIG.simulationStepMs);
    expect(game.status).toBe('chase');
  });
});

describe('the pause key', () => {
  it('opens the overlay but never closes it', () => {
    const game = reach('chase');
    expect(handlePauseKey(game, PAUSE_KEY)).toBe(true);
    expect(game.status).toBe('paused');

    // A second press cannot resume, so the event that opened the overlay can
    // never reach the Resume control the overlay focuses.
    expect(handlePauseKey(game, PAUSE_KEY)).toBe(false);
    expect(game.status).toBe('paused');
  });

  it('ignores auto-repeat from a held key', () => {
    const game = reach('chase');
    expect(handlePauseKey(game, PAUSE_KEY, { repeat: true })).toBe(false);
    expect(game.status).toBe('chase');
  });

  it('leaves every letter to the guessing keyboard', () => {
    const game = reach('guess');
    for (const key of ['p', 'P', 'r', 'R']) {
      expect(handlePauseKey(game, key)).toBe(false);
    }
    expect(game.status).toBe('guess');

    // P and R are guesses, exactly as any other letter is.
    expect(handleGameKey(game, 'p').guess?.outcome).toBe('correct');
    expect(handleGameKey(game, 'r').guess?.outcome).toBe('wrong');
  });

  it('pauses the chase from the keyboard without stealing a movement key', () => {
    const game = reach('chase');
    expect(handlePauseKey(game, 'ArrowLeft')).toBe(false);
    expect(handleGameKey(game, 'ArrowLeft').applied).toBe(true);
    expect(game.status).toBe('chase');
  });
});
