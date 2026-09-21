import type { GridPosition } from './maze.js';

/** Fruit currently on the board, ticking down its own lifetime. */
export interface FruitInstance {
  readonly position: GridPosition;
  remainingMs: number;
}

/**
 * Normal dots consumed at which each of the two fruit thresholds fires. The
 * denominator is every dot tile the maze was authored with, so it never
 * shrinks as dots are collected and stays the same across deaths and levels.
 */
export function fruitThresholds(
  originalDotCount: number,
  ratios: readonly [number, number],
): readonly [number, number] {
  return [Math.ceil(ratios[0] * originalDotCount), Math.ceil(ratios[1] * originalDotCount)];
}
