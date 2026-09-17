import { createMaze, type Maze } from './maze.js';

/**
 * Level one layout. Legend: `#` wall, `.` dot, ` ` empty corridor, `P` player
 * spawn, `T` tunnel endpoint, `h` enemy home interior, `=` enemy home door.
 * The enemy home is reserved for M3 and is deliberately unreachable.
 */
export const LEVEL_ONE_LAYOUT: readonly string[] = [
  '#####################',
  '#.........#.........#',
  '#.###.###.#.###.###.#',
  '#.###.###.#.###.###.#',
  '#...................#',
  '#.###.#.#####.#.###.#',
  '#.....#...#...#.....#',
  '#####.###.#.###.#####',
  '#####.#.......#.#####',
  '#####.#.##=##.#.#####',
  'T.......#hhh#.......T',
  '#####.#.#hhh#.#.#####',
  '#####.#.#####.#.#####',
  '#####.#...P...#.#####',
  '#####.#.#####.#.#####',
  '#.........#.........#',
  '#.###.###.#.###.###.#',
  '#...#.....#.....#...#',
  '#.#.#####.#.#####.#.#',
  '#...................#',
  '#.#######.#.#######.#',
  '#...................#',
  '#####################',
];

export function createLevelOneMaze(): Maze {
  return createMaze(LEVEL_ONE_LAYOUT);
}
