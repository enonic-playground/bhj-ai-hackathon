import type { Direction } from '../game/direction.js';
import type { Game } from '../game/game.js';

/** Movement keys the game owns while a maze is in play. */
const KEY_DIRECTIONS: Readonly<Record<string, Direction>> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

export function directionForKey(key: string): Direction | null {
  return KEY_DIRECTIONS[key.toLowerCase()] ?? null;
}

/**
 * Applies a key press to the game. Returns true when the game consumed the key,
 * which is also the signal for the DOM adapter to suppress page scrolling.
 * Keys are ignored outside play, so the title screen never moves the player.
 */
export function handleMovementKey(game: Game, key: string): boolean {
  const direction = directionForKey(key);
  if (!direction) {
    return false;
  }
  return game.requestDirection(direction);
}

/** Applies a directional pad press. Pad and keyboard share the same rules. */
export function handlePadDirection(game: Game, direction: Direction): boolean {
  return game.requestDirection(direction);
}
