import { DIRECTION_VECTORS, type Direction } from './direction.js';

/**
 * Tile kinds used by the simulation. `home` and `door` form the enemy home:
 * they are never player- or ball-walkable, and only an enemy that is leaving or
 * returning to the home is allowed to cross them.
 */
export type Tile = 'wall' | 'corridor' | 'tunnel' | 'home' | 'door';

/**
 * Which graph a move is judged against.
 *
 * - `maze` is the shared player/ball/roaming-enemy graph: corridors and tunnels
 *   only, exactly the permissions M1 and M2 shipped.
 * - `home` is that graph plus the home interior and its door, and is used only
 *   by an enemy in its exiting or returning state.
 *
 * The two are separate values rather than one flag so that widening enemy
 * movement can never widen the player's or the ball's.
 */
export type Traversal = 'maze' | 'home';

export interface GridPosition {
  readonly col: number;
  readonly row: number;
}

/** Validated metadata for the authored enemy home. */
export interface HomeLayout {
  /** Every home interior tile, row-major. */
  readonly tiles: readonly GridPosition[];
  /** The single door tile separating the home from the maze. */
  readonly door: GridPosition;
  /** The corridor immediately outside the door: where an exiting enemy joins play. */
  readonly exit: GridPosition;
  /** The home tile immediately inside the door: where a returning enemy waits. */
  readonly rest: GridPosition;
  /** Authored enemy starting slots, row-major; enemy `i` starts on slot `i`. */
  readonly spawns: readonly GridPosition[];
}

export interface Maze {
  readonly width: number;
  readonly height: number;
  /** Row-major tile grid; `tiles[row][col]`. */
  readonly tiles: readonly (readonly Tile[])[];
  readonly spawn: GridPosition;
  /** Every tile that starts with a dot on it. Power pellet tiles are not dots. */
  readonly dotTiles: readonly GridPosition[];
  /** Every tile that starts with a power pellet on it. */
  readonly powerPelletTiles: readonly GridPosition[];
  /** Rows that carry a matched pair of left/right tunnel endpoints. */
  readonly tunnelRows: readonly number[];
  /** The enemy home, or null for a layout that authors none. */
  readonly home: HomeLayout | null;
}

/** Legend used by authored layouts. */
export const TILE_CHARS = {
  '#': 'wall',
  '.': 'corridor',
  ' ': 'corridor',
  P: 'corridor',
  o: 'corridor',
  T: 'tunnel',
  h: 'home',
  E: 'home',
  '=': 'door',
} as const satisfies Record<string, Tile>;

export type TileChar = keyof typeof TILE_CHARS;

const DOT_CHAR = '.';
const SPAWN_CHAR = 'P';
const PELLET_CHAR = 'o';
const ENEMY_SLOT_CHAR = 'E';

export class MazeValidationError extends Error {
  readonly errors: readonly string[];

  constructor(errors: readonly string[]) {
    super(`Invalid maze layout:\n- ${errors.join('\n- ')}`);
    this.name = 'MazeValidationError';
    this.errors = errors;
  }
}

export function isPlayerWalkable(tile: Tile): boolean {
  return tile === 'corridor' || tile === 'tunnel';
}

/** Whether `tile` may be entered under a given traversal permission. */
export function isWalkableFor(tile: Tile, traversal: Traversal): boolean {
  if (isPlayerWalkable(tile)) {
    return true;
  }
  return traversal === 'home' && (tile === 'home' || tile === 'door');
}

export function wrapIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export function tileAt(maze: Maze, col: number, row: number): Tile {
  if (row < 0 || row >= maze.height || col < 0 || col >= maze.width) {
    return 'wall';
  }
  return maze.tiles[row]?.[col] ?? 'wall';
}

export function samePosition(a: GridPosition, b: GridPosition): boolean {
  return a.col === b.col && a.row === b.row;
}

/**
 * The tile an actor standing on `from` enters when travelling one tile in
 * `direction`, or `null` when the move is illegal under `traversal`. Leaving the
 * grid is only legal horizontally between two matched tunnel tiles, whichever
 * traversal is used: the home never touches the border.
 */
export function neighbor(
  maze: Maze,
  from: GridPosition,
  direction: Direction,
  traversal: Traversal = 'maze',
): GridPosition | null {
  const { dx, dy } = DIRECTION_VECTORS[direction];
  const rawCol = from.col + dx;
  const rawRow = from.row + dy;

  if (rawRow < 0 || rawRow >= maze.height) {
    return null;
  }
  if (rawCol < 0 || rawCol >= maze.width) {
    if (tileAt(maze, from.col, from.row) !== 'tunnel') {
      return null;
    }
    const col = wrapIndex(rawCol, maze.width);
    return tileAt(maze, col, rawRow) === 'tunnel' ? { col, row: rawRow } : null;
  }
  return isWalkableFor(tileAt(maze, rawCol, rawRow), traversal) ? { col: rawCol, row: rawRow } : null;
}

export function positionKey(position: GridPosition): string {
  return `${position.col},${position.row}`;
}

/** Every tile reachable from `origin` using legal moves under `traversal`. */
export function reachableFrom(
  maze: Maze,
  origin: GridPosition,
  traversal: Traversal = 'maze',
): Set<string> {
  const seen = new Set<string>([positionKey(origin)]);
  const queue: GridPosition[] = [origin];

  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head] as GridPosition;
    for (const direction of Object.keys(DIRECTION_VECTORS) as Direction[]) {
      const next = neighbor(maze, current, direction, traversal);
      if (!next) continue;
      const key = positionKey(next);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return seen;
}

interface LayoutAnalysis {
  readonly maze: Maze | null;
  readonly errors: readonly string[];
}

/** Orthogonal neighbours of `position` inside the grid, ignoring walkability. */
function orthogonalCells(maze: Maze, position: GridPosition): GridPosition[] {
  const cells: GridPosition[] = [];
  for (const direction of Object.keys(DIRECTION_VECTORS) as Direction[]) {
    const { dx, dy } = DIRECTION_VECTORS[direction];
    const col = position.col + dx;
    const row = position.row + dy;
    if (col < 0 || col >= maze.width || row < 0 || row >= maze.height) continue;
    cells.push({ col, row });
  }
  return cells;
}

/**
 * Validates the enemy home and derives its door, exit and rest tiles. Returns
 * null with recorded errors when the layout cannot describe a usable home, so a
 * broken release or return route is a build-time failure rather than an enemy
 * stuck at a door during play.
 */
function analyzeHome(
  maze: Maze,
  homeTiles: readonly GridPosition[],
  doors: readonly GridPosition[],
  slots: readonly GridPosition[],
  errors: string[],
): HomeLayout | null {
  if (homeTiles.length === 0 && doors.length === 0 && slots.length === 0) {
    return null; // A layout with no enemy home simply carries no enemies.
  }
  if (doors.length !== 1) {
    errors.push(`expected exactly one enemy home door ('='), found ${doors.length}`);
    return null;
  }
  if (slots.length === 0) {
    errors.push(`the enemy home has no enemy start slot ('${ENEMY_SLOT_CHAR}')`);
    return null;
  }

  const door = doors[0] as GridPosition;
  const around = orthogonalCells(maze, door);
  const exits = around.filter((cell) => isPlayerWalkable(tileAt(maze, cell.col, cell.row)));
  const insides = around.filter((cell) => tileAt(maze, cell.col, cell.row) === 'home');

  if (exits.length !== 1) {
    errors.push(
      `the door at row ${door.row}, column ${door.col} must touch exactly one corridor, found ${exits.length}`,
    );
  }
  if (insides.length !== 1) {
    errors.push(
      `the door at row ${door.row}, column ${door.col} must touch exactly one home tile, found ${insides.length}`,
    );
  }
  if (errors.length > 0) {
    return null;
  }

  const exit = exits[0] as GridPosition;
  const rest = insides[0] as GridPosition;

  // Every release and return route has to exist: each slot must reach the rest
  // tile, and the rest tile must reach the corridor outside the door.
  const fromRest = reachableFrom(maze, rest, 'home');
  for (const slot of slots) {
    if (!fromRest.has(positionKey(slot))) {
      errors.push(`enemy start slot at row ${slot.row}, column ${slot.col} cannot reach the door`);
    }
  }
  if (!fromRest.has(positionKey(exit))) {
    errors.push('the enemy home cannot reach the corridor outside its door');
  }
  // And the roaming maze must reach that corridor, or a released enemy would
  // arrive somewhere the player never goes.
  if (!reachableFrom(maze, maze.spawn).has(positionKey(exit))) {
    errors.push('the corridor outside the enemy home door is unreachable from the player spawn');
  }

  return errors.length > 0 ? null : { tiles: homeTiles, door, exit, rest, spawns: slots };
}

function analyzeLayout(lines: readonly string[]): LayoutAnalysis {
  const errors: string[] = [];

  if (lines.length === 0) {
    return { maze: null, errors: ['layout is empty'] };
  }

  const width = lines[0]?.length ?? 0;
  const height = lines.length;
  if (width === 0) {
    return { maze: null, errors: ['layout rows are empty'] };
  }
  lines.forEach((line, row) => {
    if (line.length !== width) {
      errors.push(`row ${row} has width ${line.length}, expected ${width}`);
    }
  });
  if (errors.length > 0) {
    return { maze: null, errors };
  }

  const tiles: Tile[][] = [];
  const dotTiles: GridPosition[] = [];
  const powerPelletTiles: GridPosition[] = [];
  const homeTiles: GridPosition[] = [];
  const doors: GridPosition[] = [];
  const enemySlots: GridPosition[] = [];
  const spawns: GridPosition[] = [];
  const tunnelsByRow = new Map<number, number[]>();

  for (let row = 0; row < height; row += 1) {
    const line = lines[row] as string;
    const tileRow: Tile[] = [];
    for (let col = 0; col < width; col += 1) {
      const char = line[col] as string;
      const tile = (TILE_CHARS as Record<string, Tile | undefined>)[char];
      if (!tile) {
        errors.push(`unknown tile character ${JSON.stringify(char)} at row ${row}, column ${col}`);
        tileRow.push('wall');
        continue;
      }
      tileRow.push(tile);
      if (char === DOT_CHAR) {
        dotTiles.push({ col, row });
      }
      if (char === PELLET_CHAR) {
        powerPelletTiles.push({ col, row });
      }
      if (char === SPAWN_CHAR) {
        spawns.push({ col, row });
      }
      if (char === ENEMY_SLOT_CHAR) {
        enemySlots.push({ col, row });
      }
      if (tile === 'home') {
        homeTiles.push({ col, row });
      }
      if (tile === 'door') {
        doors.push({ col, row });
      }
      if (tile === 'tunnel') {
        const cols = tunnelsByRow.get(row) ?? [];
        cols.push(col);
        tunnelsByRow.set(row, cols);
      }
    }
    tiles.push(tileRow);
  }

  if (spawns.length !== 1) {
    errors.push(`expected exactly one player spawn ('${SPAWN_CHAR}'), found ${spawns.length}`);
  }
  if (dotTiles.length === 0) {
    errors.push('layout contains no dots');
  }

  const tunnelRows: number[] = [];
  for (const [row, cols] of [...tunnelsByRow.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...cols].sort((a, b) => a - b);
    if (sorted.length !== 2 || sorted[0] !== 0 || sorted[1] !== width - 1) {
      errors.push(
        `row ${row} must place tunnel endpoints at columns 0 and ${width - 1}, found ${sorted.join(', ')}`,
      );
      continue;
    }
    tunnelRows.push(row);
  }

  // Every border tile that is not a tunnel endpoint must be solid, so the
  // player can only leave the grid through a tunnel.
  for (let col = 0; col < width; col += 1) {
    for (const row of [0, height - 1]) {
      if (isPlayerWalkable(tiles[row]?.[col] ?? 'wall')) {
        errors.push(`border tile at row ${row}, column ${col} is walkable`);
      }
    }
  }
  for (let row = 0; row < height; row += 1) {
    for (const col of [0, width - 1]) {
      const tile = tiles[row]?.[col] ?? 'wall';
      if (isPlayerWalkable(tile) && tile !== 'tunnel') {
        errors.push(`border tile at row ${row}, column ${col} is walkable but is not a tunnel`);
      }
    }
  }

  const spawn = spawns[0];
  if (spawn && !isPlayerWalkable(tiles[spawn.row]?.[spawn.col] ?? 'wall')) {
    errors.push(`player spawn at row ${spawn.row}, column ${spawn.col} is not walkable`);
  }

  if (!spawn || errors.length > 0) {
    return { maze: null, errors };
  }

  const partial: Maze = {
    width,
    height,
    tiles,
    spawn,
    dotTiles,
    powerPelletTiles,
    tunnelRows,
    home: null,
  };

  const reachable = reachableFrom(partial, spawn);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isPlayerWalkable(tiles[row]?.[col] ?? 'wall')) continue;
      if (!reachable.has(positionKey({ col, row }))) {
        errors.push(`walkable tile at row ${row}, column ${col} is unreachable from the spawn`);
      }
    }
  }
  for (const [label, collectibles] of [
    ['dot', dotTiles],
    ['power pellet', powerPelletTiles],
  ] as const) {
    for (const cell of collectibles) {
      if (!reachable.has(positionKey(cell))) {
        errors.push(`${label} at row ${cell.row}, column ${cell.col} is unreachable from the spawn`);
      }
    }
  }

  const home = analyzeHome(partial, homeTiles, doors, enemySlots, errors);
  if (errors.length > 0) {
    return { maze: null, errors };
  }

  return { maze: { ...partial, home }, errors };
}

/** Returns the layout problems found, or an empty array when the layout is valid. */
export function validateLayout(lines: readonly string[]): readonly string[] {
  return analyzeLayout(lines).errors;
}

/** Parses and validates an authored layout, throwing `MazeValidationError` when invalid. */
export function createMaze(lines: readonly string[]): Maze {
  const { maze, errors } = analyzeLayout(lines);
  if (!maze) {
    throw new MazeValidationError(errors);
  }
  return maze;
}
