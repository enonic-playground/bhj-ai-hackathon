import { createMaze, type Maze } from './maze.js';

/**
 * Level one layout. Legend: `#` wall, `.` dot, `o` power pellet, ` ` empty
 * corridor, `P` player spawn, `T` tunnel endpoint, `h` enemy home interior,
 * `E` enemy start slot inside the home, `=` enemy home door.
 *
 * The four pellets sit on the outer corridors at the zero-based cells (1, 1),
 * (19, 1), (1, 21) and (19, 21) named in the M3 brief, replacing the dot that
 * was there in M1/M2 rather than sharing the tile with it. The home keeps its
 * M1 shape and gains four start slots around the tile below the door, which is
 * where a returning enemy waits before it leaves again.
 */
export const LEVEL_ONE_LAYOUT: readonly string[] = [
  '#####################',
  '#o........#........o#',
  '#.###.###.#.###.###.#',
  '#.###.###.#.###.###.#',
  '#...................#',
  '#.###.#.#####.#.###.#',
  '#.....#...#...#.....#',
  '#####.###.#.###.#####',
  '#####.#.......#.#####',
  '#####.#.##=##.#.#####',
  'T.......#EhE#.......T',
  '#####.#.#EhE#.#.#####',
  '#####.#.#####.#.#####',
  '#####.#...P...#.#####',
  '#####.#.#####.#.#####',
  '#.........#.........#',
  '#.###.###.#.###.###.#',
  '#...#.....#.....#...#',
  '#.#.#####.#.#####.#.#',
  '#...................#',
  '#.#######.#.#######.#',
  '#o.................o#',
  '#####################',
];

export function createLevelOneMaze(): Maze {
  return createMaze(LEVEL_ONE_LAYOUT);
}
