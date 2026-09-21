/**
 * Pure presentation-motion helpers, factored out of `MazeRenderer` so the
 * `prefers-reduced-motion` behavior (D020/AC3) is testable without a canvas.
 * None of these change speed, timers, input, collision or scoring: they only
 * choose what a frame looks like.
 */

/**
 * The ball's fill runs once through every hue in this much active maze time
 * in normal motion (the D015 amendment). Because the phase comes from the
 * game's own active time, it advances only while the maze does.
 */
export const BALL_HUE_CYCLE_MS = 2000;

/** The hue the cycle starts from: M2's ball colour, so a fresh run looks familiar. */
const BALL_START_HUE = 172;
/** Held constant across the cycle, so every hue is equally bright and saturated. */
const BALL_SATURATION = 85;
const BALL_LIGHTNESS = 62;

/**
 * The ball's fill at a moment of active maze time. In reduced motion the
 * phase is pinned to zero, so the ball keeps a single stable, contrasting
 * colour (D020 AC3) instead of sweeping the hue circle; its white ring is
 * unaffected and drawn the same way in both modes.
 */
export function ballFillColor(activeTimeMs: number, reducedMotion: boolean): string {
  const phase = reducedMotion ? 0 : activeTimeMs;
  const turns = (BALL_START_HUE + (360 * phase) / BALL_HUE_CYCLE_MS) / 360;
  const hue = (turns - Math.floor(turns)) * 360;
  return `hsl(${hue.toFixed(3)}, ${BALL_SATURATION}%, ${BALL_LIGHTNESS}%)`;
}

const PELLET_BASE_RADIUS_FACTOR = 0.28;
const PELLET_PULSE_AMPLITUDE = 0.06;

/**
 * Power pellet radius, as a fraction of tile size. Reduced motion drops the
 * oscillation and holds a steady mid-cycle size, which keeps the pellet
 * readable as a distinct, larger pick-up without decorative pulsing.
 */
export function pelletRadiusFactor(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return PELLET_BASE_RADIUS_FACTOR;
  }
  return PELLET_BASE_RADIUS_FACTOR + PELLET_PULSE_AMPLITUDE * Math.sin(timeMs / 180);
}

/** Frightened enemies flash white for the last stretch of the effect in normal motion. */
export const FRIGHTENED_WARNING_MS = 1800;
const FRIGHTENED_FLASH_PERIOD_MS = 250;

export type FrightenedTone = 'blue' | 'flash';

/**
 * Which of the two frightened tones to draw. In normal motion the warning
 * period blinks between them; in reduced motion the warning period holds the
 * flash tone steady, so the "about to end" cue survives without flashing.
 */
export function frightenedTone(frightenedMs: number, timeMs: number, reducedMotion: boolean): FrightenedTone {
  if (frightenedMs > FRIGHTENED_WARNING_MS) {
    return 'blue';
  }
  if (reducedMotion) {
    return 'flash';
  }
  return Math.floor(timeMs / FRIGHTENED_FLASH_PERIOD_MS) % 2 === 0 ? 'flash' : 'blue';
}

const PROTECTION_ALPHA_BASE = 0.55;
const PROTECTION_ALPHA_AMPLITUDE = 0.45;
const PROTECTION_ALPHA_STEADY = 0.85;

/**
 * The protection ring's opacity. Reduced motion holds a steady, clearly
 * visible alpha instead of pulsing, so the shield indicator stays readable
 * without an oscillating effect.
 */
export function protectionAlpha(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return PROTECTION_ALPHA_STEADY;
  }
  return PROTECTION_ALPHA_BASE + PROTECTION_ALPHA_AMPLITUDE * Math.abs(Math.sin(timeMs / 140));
}
