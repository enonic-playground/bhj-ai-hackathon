import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { Game } from '../src/game/game.js';
import { FixedStepLoop } from '../src/game/loop.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { createSeededRandom } from '../src/game/random.js';
import { fixedWord } from '../src/game/words.js';
import { ballAt, ballFreeGame, corridorMaze, createTestGame, runUntil } from './fixtures.js';

const STEP_MS = DEFAULT_CONFIG.simulationStepMs;

/**
 * The same seed gives every cadence the same word, the same ball spawn and the
 * same ball decisions, so any difference between them comes from the render
 * cadence alone.
 */
function createSeededGame(): Game {
  return new Game(createLevelOneMaze(), DEFAULT_CONFIG, {
    random: createSeededRandom(2026),
    selectWord: fixedWord('APPLE', 'Fruit'),
  });
}

/**
 * Plays the same simulated time and the same input schedule at a given render
 * cadence, expressed as simulation steps per animation frame. Both the input
 * schedule and the stopping point are counted in simulation steps rather than
 * frame times: a step of 1000/120 ms is not exactly representable, so a frame
 * counter would hand one cadence slightly more simulated time or move its input
 * a few steps, and the comparison would no longer be about cadence. Asking for
 * at most the remaining steps' worth of time can never overrun, because the
 * accumulator always holds less than one step.
 */
function playAtCadence(stepsPerFrame: number, totalSteps: number): Game {
  const game = createSeededGame();
  let stepsRun = 0;
  const loop = new FixedStepLoop({
    stepMs: STEP_MS,
    maxStepsPerFrame: DEFAULT_CONFIG.maxStepsPerFrame,
    onStep: (stepSeconds) => {
      stepsRun += 1;
      if (stepsRun === Math.floor(totalSteps / 2)) {
        game.requestDirection('up');
      }
      game.step(stepSeconds);
    },
  });

  game.startLevel();
  game.requestDirection('left');
  while (stepsRun < totalSteps) {
    loop.advance(STEP_MS * Math.min(stepsPerFrame, totalSteps - stepsRun));
  }
  return game;
}

describe('fixed step loop', () => {
  it('runs whole steps and carries the remainder', () => {
    const steps: number[] = [];
    const loop = new FixedStepLoop({
      stepMs: 10,
      maxStepsPerFrame: 5,
      onStep: (stepSeconds) => steps.push(stepSeconds),
    });

    expect(loop.advance(25)).toBe(2);
    expect(loop.advance(5)).toBe(1); // 5 ms carried over plus 5 ms.
    expect(steps).toEqual([0.01, 0.01, 0.01]);
  });

  it('bounds catch-up so a long pause cannot replay minutes of movement', () => {
    const loop = new FixedStepLoop({ stepMs: 10, maxStepsPerFrame: 5, onStep: () => {} });
    expect(loop.advance(60_000)).toBe(5);
    expect(loop.advance(10)).toBe(1);
  });

  it('ignores non-positive and non-finite frame times', () => {
    const loop = new FixedStepLoop({ stepMs: 10, maxStepsPerFrame: 5, onStep: () => {} });
    expect(loop.advance(0)).toBe(0);
    expect(loop.advance(-100)).toBe(0);
    expect(loop.advance(Number.NaN)).toBe(0);
  });

  it('drops buffered time on reset', () => {
    const loop = new FixedStepLoop({ stepMs: 10, maxStepsPerFrame: 5, onStep: () => {} });
    loop.advance(9);
    loop.reset();
    expect(loop.advance(9)).toBe(0);
  });
});

describe('render cadence independence', () => {
  it('produces equivalent movement for different frame rates', () => {
    const totalSteps = 144; // 1.2 s of simulated time.
    const smooth = playAtCadence(1, totalSteps).snapshot(); // 120 frames per second.
    const sixty = playAtCadence(2, totalSteps).snapshot(); // 60 frames per second.
    const twenty = playAtCadence(6, totalSteps).snapshot(); // 20 frames per second.

    for (const other of [sixty, twenty]) {
      expect(other.player.x).toBeCloseTo(smooth.player.x, 9);
      expect(other.player.y).toBeCloseTo(smooth.player.y, 9);
      expect(other.score).toBe(smooth.score);
      expect(other.player.direction).toBe(smooth.player.direction);
      // The ball is simulated on the same clock, not per rendered frame.
      expect(other.status).toBe(smooth.status);
      expect(other.ball).toEqual(smooth.ball);
    }
    expect(smooth.score).toBeGreaterThan(0);
    expect(smooth.ball).not.toBeNull();
  });

  it('cannot move the player through a wall during a stalled frame', () => {
    const game = ballFreeGame(corridorMaze());
    const loop = new FixedStepLoop({
      stepMs: STEP_MS,
      maxStepsPerFrame: DEFAULT_CONFIG.maxStepsPerFrame,
      onStep: (stepSeconds) => game.step(stepSeconds),
    });
    game.startLevel();
    game.requestDirection('right');

    for (let i = 0; i < 20; i += 1) {
      loop.advance(30_000); // Simulated stalls, e.g. a backgrounded tab.
      expect(game.player.x).toBeLessThanOrEqual(5);
      expect(game.player.y).toBe(1);
    }
    expect(game.player.x).toBeCloseTo(5, 9);
    expect(game.score).toBe(4 * DEFAULT_CONFIG.dotScore);
  });
});

describe('frozen states and background time', () => {
  function resumingGame(): { game: Game; loop: FixedStepLoop } {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    const loop = new FixedStepLoop({
      stepMs: STEP_MS,
      maxStepsPerFrame: DEFAULT_CONFIG.maxStepsPerFrame,
      onStep: (stepSeconds) => game.step(stepSeconds),
    });
    game.startLevel();
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);
    game.guess('Z');
    expect(game.status).toBe('resuming');
    return { game, loop };
  }

  it('leaves the countdown untouched while the clock is dropped', () => {
    const { game, loop } = resumingGame();
    const remaining = game.resumeRemainingMs;

    // What the shell does while the page is hidden: drop the frame time.
    for (let frame = 0; frame < 10; frame += 1) {
      loop.reset();
    }
    expect(game.resumeRemainingMs).toBe(remaining);
    expect(game.status).toBe('resuming');
  });

  it('cannot replay a long absence into the countdown', () => {
    const { game, loop } = resumingGame();
    const remaining = game.resumeRemainingMs;

    loop.advance(60_000); // One minute of frame time in a single frame.
    const spent = remaining - game.resumeRemainingMs;
    expect(spent).toBeCloseTo(STEP_MS * DEFAULT_CONFIG.maxStepsPerFrame, 6);
    expect(game.status).toBe('resuming');
  });

  it('does not advance a frozen maze when frames keep arriving', () => {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    const loop = new FixedStepLoop({
      stepMs: STEP_MS,
      maxStepsPerFrame: DEFAULT_CONFIG.maxStepsPerFrame,
      onStep: (stepSeconds) => game.step(stepSeconds),
    });
    game.startLevel();
    game.requestDirection('right');
    runUntil(game, () => game.status === 'guess', 5000);

    const frozen = game.snapshot();
    const activeTime = game.activeTimeMs;
    for (let frame = 0; frame < 120; frame += 1) {
      loop.advance(16);
    }
    expect(game.snapshot()).toEqual(frozen);
    expect(game.activeTimeMs).toBe(activeTime); // Animation time is frozen too.
  });
});
