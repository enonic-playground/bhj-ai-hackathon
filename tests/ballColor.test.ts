import { describe, expect, it } from 'vitest';
import { BALL_HUE_CYCLE_MS, ballFillColor as ballFillColorAt } from '../src/render/motion.js';

/** This file exercises normal motion only; `tests/motion.test.ts` covers reduced motion. */
function ballFillColor(activeTimeMs: number): string {
  return ballFillColorAt(activeTimeMs, false);
}

/**
 * These checks describe what the colour has to do, not how it is produced: the
 * cycle repeats, it never jumps, it visits the whole spectrum, and it stays
 * equally readable throughout. Parsing goes through an ordinary HSL-to-RGB
 * conversion rather than the renderer's own arithmetic, so a change of formula
 * that broke any of those properties would still be caught.
 */
interface Rgb {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

interface Hsl {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}

function parseHsl(color: string): Hsl {
  const match = /^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/.exec(color);
  if (!match) {
    throw new Error(`not an hsl() colour: ${color}`);
  }
  return {
    hue: Number(match[1]),
    saturation: Number(match[2]),
    lightness: Number(match[3]),
  };
}

/** The standard conversion, so the test reasons about what is actually drawn. */
function toRgb({ hue, saturation, lightness }: Hsl): Rgb {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = l - chroma / 2;
  const [r, g, b] = (
    [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ] as const
  )[Math.min(5, Math.floor(sector))] ?? [0, 0, 0];
  return {
    red: Math.round((r + base) * 255),
    green: Math.round((g + base) * 255),
    blue: Math.round((b + base) * 255),
  };
}

function rgbAt(activeTimeMs: number): Rgb {
  return toRgb(parseHsl(ballFillColor(activeTimeMs)));
}

function channelDistance(a: Rgb, b: Rgb): number {
  return Math.max(
    Math.abs(a.red - b.red),
    Math.abs(a.green - b.green),
    Math.abs(a.blue - b.blue),
  );
}

describe('the ball fill cycle', () => {
  it('completes exactly one revolution every two active seconds', () => {
    expect(BALL_HUE_CYCLE_MS).toBe(2000);
    for (const time of [0, 137, 500, 1999.5, 5000]) {
      expect(ballFillColor(time + BALL_HUE_CYCLE_MS)).toBe(ballFillColor(time));
      expect(ballFillColor(time + 4 * BALL_HUE_CYCLE_MS)).toBe(ballFillColor(time));
    }
  });

  it('visits the whole spectrum within one cycle', () => {
    const hues: number[] = [];
    for (let time = 0; time < BALL_HUE_CYCLE_MS; time += 10) {
      hues.push(parseHsl(ballFillColor(time)).hue);
    }
    // Every sixth of the circle is reached, so no part of the spectrum is skipped.
    for (let sector = 0; sector < 6; sector += 1) {
      const from = sector * 60;
      expect(hues.some((hue) => hue >= from && hue < from + 60)).toBe(true);
    }
  });

  it('sweeps smoothly, including across the 360 degree join', () => {
    // A frame at 60 Hz is about 17 ms of active time. Over four whole cycles,
    // including every wrap, no step may look like a jump to another colour.
    const stepMs = 17;
    let worst = 0;
    let previous = rgbAt(0);
    for (let time = stepMs; time <= 4 * BALL_HUE_CYCLE_MS; time += stepMs) {
      const current = rgbAt(time);
      worst = Math.max(worst, channelDistance(previous, current));
      previous = current;
    }
    expect(worst).toBeLessThan(24);

    // And the join itself is no larger a step than the middle of a cycle.
    const wrapTime = ((360 - 172) / 360) * BALL_HUE_CYCLE_MS; // Hue passes 360 here.
    const acrossJoin = channelDistance(rgbAt(wrapTime - 1), rgbAt(wrapTime + 1));
    const midCycle = channelDistance(rgbAt(700), rgbAt(702));
    expect(acrossJoin).toBeLessThanOrEqual(midCycle + 2);
  });

  it('never blinks off, dims or desaturates', () => {
    for (let time = 0; time < BALL_HUE_CYCLE_MS; time += 5) {
      const { saturation, lightness } = parseHsl(ballFillColor(time));
      expect(saturation).toBe(85);
      expect(lightness).toBe(62);
      const { red, green, blue } = rgbAt(time);
      // Bright enough to read against the maze at every hue in the cycle.
      expect(Math.max(red, green, blue)).toBeGreaterThan(200);
      expect(Math.min(red, green, blue)).toBeLessThan(120);
    }
  });

  it('keeps moving, so the cycle is visible rather than static', () => {
    const quarter = BALL_HUE_CYCLE_MS / 4;
    for (let time = 0; time < BALL_HUE_CYCLE_MS; time += quarter) {
      expect(channelDistance(rgbAt(time), rgbAt(time + quarter))).toBeGreaterThan(60);
    }
  });

  it('is a pure function of active time, so a frozen maze holds its colour', () => {
    // The renderer is handed `Game.activeTimeMs`; the same moment of active
    // time always produces the same fill, however long the wall clock runs on.
    expect(ballFillColor(1234.5)).toBe(ballFillColor(1234.5));
    expect(ballFillColor(0)).not.toBe(ballFillColor(300));
  });
});
