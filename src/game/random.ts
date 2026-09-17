/**
 * Randomness is injected everywhere it affects gameplay, so tests can pin a
 * seed and reproduce a whole round. A source returns a number in [0, 1).
 */
export type RandomSource = () => number;

/** Deterministic 32-bit generator (mulberry32); the same seed replays a round. */
export function createSeededRandom(seed: number): RandomSource {
  let state = Math.trunc(seed) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ordinary play uses the platform generator. */
export function createSystemRandom(): RandomSource {
  return () => Math.random();
}

/** Uniform choice from a non-empty list; returns null for an empty one. */
export function pickRandom<T>(items: readonly T[], random: RandomSource): T | null {
  if (items.length === 0) {
    return null;
  }
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[index] as T;
}
