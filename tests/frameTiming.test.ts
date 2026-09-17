import { describe, expect, it } from 'vitest';
import { FrameTiming } from '../src/app/frameTiming.js';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { FixedStepLoop } from '../src/game/loop.js';
import type { Game } from '../src/game/game.js';
import { ballAt, corridorMaze, createTestGame, runUntil } from './fixtures.js';

const STEP_MS = DEFAULT_CONFIG.simulationStepMs;
/** The most frame time the loop will ever replay: 12 steps, about 100 ms. */
const CATCH_UP_MS = STEP_MS * DEFAULT_CONFIG.maxStepsPerFrame;

/**
 * The shell's own timing wiring, with the page's visibility under the test's
 * control: `frame` is the animation callback, `hide`/`show` are the two
 * directions of `visibilitychange`, and `blur` is the window blur handler.
 * Only the DOM event registration is left out, so this exercises the code the
 * shell ships.
 */
function createPage(game: Game) {
  let hidden = false;
  const loop = new FixedStepLoop({
    stepMs: STEP_MS,
    maxStepsPerFrame: DEFAULT_CONFIG.maxStepsPerFrame,
    onStep: (stepSeconds) => game.step(stepSeconds),
  });
  const timing = new FrameTiming({
    isHidden: () => hidden,
    advance: (elapsedMs) => loop.advance(elapsedMs),
    drop: () => loop.reset(),
  });

  return {
    frame: (time: number): void => timing.frame(time),
    hide: (): void => {
      hidden = true;
      game.clearInput();
      timing.suspend();
    },
    show: (): void => {
      hidden = false;
      timing.suspend();
    },
    blur: (): void => {
      game.clearInput();
      timing.suspend();
    },
  };
}

/** A round counting down to the resume, with `remainingMs` left or less. */
function countingDownGame(remainingMs: number): Game {
  const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
  game.startLevel();
  game.requestDirection('right');
  runUntil(game, () => game.status === 'guess', 5000);
  game.guess('Z');
  expect(game.status).toBe('resuming');
  runUntil(game, () => game.resumeRemainingMs <= remainingMs, DEFAULT_CONFIG.resumeCountdownMs);
  expect(game.resumeRemainingMs).toBeGreaterThan(0);
  return game;
}

describe('frame timing', () => {
  it('gives the first frame no elapsed time', () => {
    const elapsed: number[] = [];
    const timing = new FrameTiming({
      isHidden: () => false,
      advance: (ms) => elapsed.push(ms),
      drop: () => {},
    });

    timing.frame(1_000);
    timing.frame(1_016);
    expect(elapsed).toEqual([0, 16]);
  });

  it('rebases the clock on suspension, so no elapsed time survives it', () => {
    const elapsed: number[] = [];
    let drops = 0;
    const timing = new FrameTiming({
      isHidden: () => false,
      advance: (ms) => elapsed.push(ms),
      drop: () => {
        drops += 1;
      },
    });

    timing.frame(1_000);
    timing.frame(1_016);
    timing.suspend();
    timing.frame(61_000); // The first frame back after a minute away.
    timing.frame(61_016);
    expect(elapsed).toEqual([0, 16, 0, 16]);
    expect(drops).toBe(1);
  });

  it('advances nothing for a frame delivered while hidden', () => {
    let hidden = false;
    const elapsed: number[] = [];
    const timing = new FrameTiming({
      isHidden: () => hidden,
      advance: (ms) => elapsed.push(ms),
      drop: () => {},
    });

    timing.frame(1_000);
    hidden = true;
    timing.frame(1_016);
    hidden = false;
    timing.frame(61_000); // Also rebased: the hidden frame spent no time.
    timing.frame(61_016);
    expect(elapsed).toEqual([0, 0, 16]);
  });
});

describe('background time and the resume countdown', () => {
  it('spends no hidden time on a countdown with less than one catch-up left', () => {
    const game = countingDownGame(50);
    const page = createPage(game);
    const remaining = game.resumeRemainingMs;
    expect(remaining).toBeLessThan(CATCH_UP_MS);

    page.frame(1_000);
    page.hide();
    // No frames arrive while the page is hidden.
    page.show();
    page.frame(61_000); // One minute of absence in the first frame back.

    expect(game.status).toBe('resuming');
    expect(game.resumeRemainingMs).toBe(remaining);
  });

  it('leaves the frozen maze untouched across an absence', () => {
    const game = countingDownGame(50);
    const page = createPage(game);
    page.frame(1_000);
    const frozen = game.snapshot();

    page.hide();
    page.show();
    page.frame(61_000);

    expect(game.snapshot()).toEqual(frozen);
  });

  it('resumes on visible time alone once the page is back', () => {
    const game = countingDownGame(50);
    const page = createPage(game);
    const remaining = game.resumeRemainingMs;

    page.frame(1_000);
    page.hide();
    page.show();
    page.frame(61_000);
    expect(game.status).toBe('resuming');

    // Ordinary frames after the return spend ordinary time.
    page.frame(61_016);
    expect(game.resumeRemainingMs).toBeLessThan(remaining);
    for (let time = 61_032; game.status === 'resuming' && time < 62_000; time += 16) {
      page.frame(time);
    }
    expect(game.status).toBe('chase');
  });

  it('keeps hidden frames from moving actors', () => {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    game.startLevel();
    game.requestDirection('right');
    const page = createPage(game);
    page.frame(0);
    page.frame(16);
    const moving = game.snapshot();
    expect(moving.player.x).toBeGreaterThan(1);

    page.hide();
    for (let time = 1_000; time <= 60_000; time += 1_000) {
      page.frame(time); // A throttled hidden tab still delivering frames.
    }
    page.show();
    page.frame(61_000);
    expect(game.snapshot()).toEqual(moving);
  });

  it('drops a blurred frame interval as well', () => {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    game.startLevel();
    game.requestDirection('right');
    const page = createPage(game);
    page.frame(0);
    page.frame(16);
    const blurred = game.snapshot();

    page.blur();
    page.frame(30_000); // The window regains focus after half a minute.
    expect(game.snapshot()).toEqual(blurred);
  });
});
