import type { BallSpawnSelector, GameOptions } from '../game/game.js';
import { createSeededRandom, type RandomSource } from '../game/random.js';
import { SEED_WORDS, type WordEntry } from '../game/words.js';

/**
 * Deterministic start-up for browser tests, read from the query string:
 *
 * - `testSeed=<integer>` seeds ball spawns and ball decisions;
 * - `testWord=<index>` pins the round's word to that entry of `SEED_WORDS`;
 * - `testBall=off` runs the maze with no ball, so the movement, dot and layout
 *   journeys inherited from M1 cannot be interrupted by a legitimate capture.
 *
 * All three are ignored unless present and well formed, so an ordinary visit to
 * the app is unaffected. They only choose what a round starts with: nothing
 * mutates a running game, no answer is revealed in the page, and every rule —
 * capture, guessing, scoring and transitions — runs exactly as in ordinary
 * play. The complete-loop journey uses the real spawn rule and the real capture
 * algorithm; only its word and seed are pinned.
 */
export function readTestFixture(search: string): GameOptions {
  const params = new URLSearchParams(search);
  const options: {
    random?: RandomSource;
    selectWord?: () => WordEntry;
    selectBallSpawn?: BallSpawnSelector;
  } = {};

  const seed = params.get('testSeed');
  if (seed !== null && /^\d{1,10}$/.test(seed)) {
    options.random = createSeededRandom(Number(seed));
  }

  const wordIndex = params.get('testWord');
  if (wordIndex !== null && /^\d{1,3}$/.test(wordIndex)) {
    const entry = SEED_WORDS[Number(wordIndex)];
    if (entry) {
      options.selectWord = () => entry;
    }
  }

  if (params.get('testBall') === 'off') {
    options.selectBallSpawn = () => null;
  }

  return options;
}
