import type { EnemyDefinition } from '../game/config.js';
import type { BallSpawnSelector, GameOptions, WordSelectionContext } from '../game/game.js';
import { isPlayerWalkable, tileAt } from '../game/maze.js';
import { createSeededRandom, type RandomSource } from '../game/random.js';
import { SEED_WORDS, type WordEntry } from '../game/words.js';

/**
 * Deterministic start-up for browser tests, read from the query string:
 *
 * - `testSeed=<integer>` seeds ball spawns and ball decisions;
 * - `testWord=<index>` pins every level's word to that one entry of
 *   `SEED_WORDS`, independently of the level's normal campaign length — the
 *   inherited M2/M3 single-word journeys use this, unchanged since M3;
 * - `testWords=<i1>,<i2>,...` pins level 1, 2, 3… to those `SEED_WORDS`
 *   entries in order, reusing the last one for any level beyond the list.
 *   This is how the M4 five-level journey knows every level's word without
 *   the runtime snapshot ever revealing an unsolved answer: the test itself
 *   chose the words through this query string, exactly as a fixture-only
 *   fixed spawn or seed is known to a test without being leaked by the game;
 * - `testBall=off` runs the maze with no ball, so the movement, dot and layout
 *   journeys inherited from M1 cannot be interrupted by a legitimate capture,
 *   and `testBall=<col>,<row>` starts it on one tile instead, which is how the
 *   ball can be put on the tunnel row for a seam check rather than waited for;
 * - `testEnemies=off` runs the maze with no enemies, for the same reason: the
 *   inherited M1/M2 journeys assert movement and layout, not survival. The M3
 *   journeys and the production smoke keep the real four.
 *
 * All are ignored unless present and well formed, so an ordinary visit to the
 * app is unaffected. They only choose what a round or a level starts with:
 * nothing mutates a running game, no answer is revealed in the page, and every
 * rule — capture, guessing, scoring and transitions — runs exactly as in
 * ordinary play.
 */
export function readTestFixture(search: string): GameOptions {
  const params = new URLSearchParams(search);
  const options: {
    random?: RandomSource;
    selectWord?: (context: WordSelectionContext) => WordEntry;
    selectBallSpawn?: BallSpawnSelector;
    enemies?: readonly EnemyDefinition[];
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

  const wordList = params.get('testWords');
  if (wordList !== null) {
    const entries = wordList
      .split(',')
      .map((index) => (/^\d{1,3}$/.test(index) ? SEED_WORDS[Number(index)] : undefined));
    if (entries.length > 0 && entries.every((entry): entry is WordEntry => entry !== undefined)) {
      options.selectWord = ({ level }) => entries[Math.min(level - 1, entries.length - 1)] as WordEntry;
    }
  }

  const ball = params.get('testBall');
  if (ball === 'off') {
    options.selectBallSpawn = () => null;
  } else if (ball !== null) {
    const tile = /^(\d{1,3}),(\d{1,3})$/.exec(ball);
    if (tile) {
      const position = { col: Number(tile[1]), row: Number(tile[2]) };
      // A tile the ball could not legally occupy is ignored rather than used,
      // so a mistyped parameter cannot put it inside a wall or the enemy home.
      options.selectBallSpawn = (maze) =>
        isPlayerWalkable(tileAt(maze, position.col, position.row)) ? position : null;
    }
  }

  if (params.get('testEnemies') === 'off') {
    options.enemies = [];
  }

  return options;
}
