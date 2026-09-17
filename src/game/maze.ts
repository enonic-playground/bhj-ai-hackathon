import { DIRECTION_VECTORS, type Direction } from './direction.js';

/**
 * Tile kinds used by the simulation. `home` and `door` belong to the enemy home
 * reserved for M3: they are never player-walkable and hold no collectibles.
 */
export type Tile = 'wall' | 'corridor' | 'tunnel' | 'home' | 'door';

export interface GridPosition {
  readonly col: number;
  readonly row: number;
}

export interface Maze {
  readonly width: number;
  readonly height: number;
  /** Row-major tile grid; `tiles[row][col]`. */
  readonly tiles: readonly (readonly Tile[])[];
  readonly spawn: GridPosition;
  /** Every tile that starts with a dot on it. */
  readonly dotTiles: readonly GridPosition[];
  /** Rows that carry a matched pair of left/right tunnel endpoints. */
  readonly tunnelRows: readonly number[];
}

/** Legend used by authored layouts. */
export const TILE_CHARS = {
  '#': 'wall',
  '.': 'corridor',
  ' ': 'corridor',
  P: 'corridor',
  T: 'tunnel',
  h: 'home',
  '=': 'door',
} as const satisfies Record<string, Tile>;

export type TileChar = keyof typeof TILE_CHARS;

const DOT_CHAR = '.';
const SPAWN_CHAR = 'P';

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

export function wrapIndex(value: number, size: number): number {
  return ((value % size) + size) % size;
}

export function tileAt(maze: Maze, col: number, row: number): Tile {
  if (row < 0 || row >= maze.height || col < 0 || col >= maze.width) {
    return 'wall';
  }
  return maze.tiles[row]?.[col] ?? 'wall';
}

/**
 * The tile an actor standing on `from` enters when travelling one tile in
 * `direction`, or `null` when the move is illegal. Leaving the grid is only
 * legal horizontally between two matched tunnel tiles.
 */
export function neighbor(maze: Maze, from: GridPosition, direction: Direction): GridPosition | null {
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
  return isPlayerWalkable(tileAt(maze, rawCol, rawRow)) ? { col: rawCol, row: rawRow } : null;
}

export function positionKey(position: GridPosition): string {
  return `${position.col},${position.row}`;
}

/** Every tile the player can reach from `origin` using legal moves only. */
export function reachableFrom(maze: Maze, origin: GridPosition): Set<string> {
  const seen = new Set<string>([positionKey(origin)]);
  const queue: GridPosition[] = [origin];

  while (queue.length > 0) {
    const current = queue.shift() as GridPosition;
    for (const direction of Object.keys(DIRECTION_VECTORS) as Direction[]) {
      const next = neighbor(maze, current, direction);
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
      if (char === SPAWN_CHAR) {
        spawns.push({ col, row });
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

  const maze: Maze = { width, height, tiles, spawn, dotTiles, tunnelRows };

  const reachable = reachableFrom(maze, spawn);
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!isPlayerWalkable(tiles[row]?.[col] ?? 'wall')) continue;
      if (!reachable.has(positionKey({ col, row }))) {
        errors.push(`walkable tile at row ${row}, column ${col} is unreachable from the spawn`);
      }
    }
  }
  for (const dot of dotTiles) {
    if (!reachable.has(positionKey(dot))) {
      errors.push(`dot at row ${dot.row}, column ${dot.col} is unreachable from the spawn`);
    }
  }

  return errors.length > 0 ? { maze: null, errors } : { maze, errors };
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
