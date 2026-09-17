export const DIRECTIONS = ['up', 'down', 'left', 'right'] as const;

export type Direction = (typeof DIRECTIONS)[number];

export interface DirectionVector {
  readonly dx: number;
  readonly dy: number;
}

export const DIRECTION_VECTORS: Record<Direction, DirectionVector> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

const OPPOSITES: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export function oppositeDirection(direction: Direction): Direction {
  return OPPOSITES[direction];
}

export function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}
