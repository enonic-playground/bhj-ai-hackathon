import { describe, expect, it } from 'vitest';
import {
  BALL_HUE_CYCLE_MS,
  FRIGHTENED_WARNING_MS,
  ballFillColor,
  frightenedTone,
  pelletRadiusFactor,
  protectionAlpha,
} from '../src/render/motion.js';

/**
 * Reduced-motion presentation only (AC3): normal-motion behaviour for these
 * same functions is covered in detail by `tests/ballColor.test.ts` and the
 * renderer's existing frightened/pellet/protection callers.
 */
describe('reduced motion: ball fill', () => {
  it('holds a single stable colour regardless of active time', () => {
    const first = ballFillColor(0, true);
    for (const time of [1, 500, 1999, BALL_HUE_CYCLE_MS, BALL_HUE_CYCLE_MS * 5.5]) {
      expect(ballFillColor(time, true)).toBe(first);
    }
  });

  it('matches the cycle colour at time zero, so the stable hue is still contrasting', () => {
    expect(ballFillColor(0, true)).toBe(ballFillColor(0, false));
  });

  it('differs from normal motion once time has advanced', () => {
    expect(ballFillColor(500, true)).not.toBe(ballFillColor(500, false));
  });
});

describe('reduced motion: pellet radius', () => {
  it('holds a steady mid-cycle size instead of pulsing', () => {
    const steady = pelletRadiusFactor(0, true);
    for (const time of [0, 90, 180, 270, 360, 5000]) {
      expect(pelletRadiusFactor(time, true)).toBe(steady);
    }
  });

  it('normal motion actually varies over time', () => {
    const values = new Set([0, 90, 180, 270].map((time) => pelletRadiusFactor(time, false)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('reduced motion: frightened tone', () => {
  it('is blue outside the warning window in both modes', () => {
    expect(frightenedTone(FRIGHTENED_WARNING_MS + 1, 0, true)).toBe('blue');
    expect(frightenedTone(FRIGHTENED_WARNING_MS + 1, 0, false)).toBe('blue');
  });

  it('holds the flash tone steady through the warning window, never blinking back to blue', () => {
    for (let time = 0; time < 2000; time += 37) {
      expect(frightenedTone(FRIGHTENED_WARNING_MS - 1, time, true)).toBe('flash');
    }
  });

  it('normal motion actually alternates within the warning window', () => {
    const tones = new Set(
      [0, 125, 250, 375, 500].map((time) => frightenedTone(FRIGHTENED_WARNING_MS - 1, time, false)),
    );
    expect(tones.size).toBe(2);
  });
});

describe('reduced motion: protection ring alpha', () => {
  it('holds a steady, clearly visible alpha instead of pulsing', () => {
    const steady = protectionAlpha(0, true);
    expect(steady).toBeGreaterThan(0.5);
    for (const time of [0, 70, 140, 210, 5000]) {
      expect(protectionAlpha(time, true)).toBe(steady);
    }
  });

  it('normal motion actually varies over time', () => {
    const values = new Set([0, 70, 140, 210].map((time) => protectionAlpha(time, false)));
    expect(values.size).toBeGreaterThan(1);
  });
});
