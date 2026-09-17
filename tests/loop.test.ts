import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { Game } from '../src/game/game.js';
import { FixedStepLoop } from '../src/game/loop.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { corridorMaze } from './fixtures.js';

const STEP_MS = DEFAULT_CONFIG.simulationStepMs;

function createLoopedGame(): { game: Game; loop: FixedStepLoop } {
  const game = new Game(createLevelOneMaze());
  const loop = new FixedStepLoop({
    stepMs: STEP_MS,
    maxStepsPerFrame: DEFAULT_CONFIG.maxStepsPerFrame,
    onStep: (stepSeconds) => game.step(stepSeconds),
  });
  game.startLevel();
  return { game, loop };
}

/**
 * Plays the same total simulated time and the same input schedule at a given
 * render cadence, expressed as simulation steps per animation frame.
 */
function playAtCadence(stepsPerFrame: number, totalSteps: number): Game {
  const { game, loop } = createLoopedGame();
  game.requestDirection('left');
  let stepsRun = 0;
  for (let frame = 0; frame < totalSteps / stepsPerFrame; frame += 1) {
    loop.advance(STEP_MS * stepsPerFrame);
    stepsRun += stepsPerFrame;
    if (stepsRun >= totalSteps / 2) {
      game.requestDirection('up'); // Same input schedule at every cadence.
    }
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
      expect(other.player.x).toBeCloseTo(smooth.player.x, 6);
      expect(other.player.y).toBeCloseTo(smooth.player.y, 6);
      expect(other.score).toBe(smooth.score);
      expect(other.player.direction).toBe(smooth.player.direction);
    }
    expect(smooth.score).toBeGreaterThan(0);
  });

  it('cannot move the player through a wall during a stalled frame', () => {
    const game = new Game(corridorMaze());
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
