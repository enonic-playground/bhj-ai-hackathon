import type { Direction } from '../game/direction.js';
import type { Game, GameStatus, GuessResult } from '../game/game.js';
import { normalizeLetter } from '../game/words.js';

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

/**
 * Which kind of key the current state owns. Chase owns movement; guessing owns
 * letters, so W/A/S/D spell guesses there instead of moving the player. The
 * title screen, the resume countdown and the result panel own neither, so held
 * or repeated input cannot leak across a transition.
 */
export type InputMode = 'movement' | 'letters' | 'none';

export function inputModeFor(status: GameStatus): InputMode {
  switch (status) {
    case 'chase':
      return 'movement';
    case 'guess':
      return 'letters';
    default:
      return 'none';
  }
}

export function directionForKey(key: string): Direction | null {
  return KEY_DIRECTIONS[key.toLowerCase()] ?? null;
}

/** The letter a key would guess: single A–Z characters only. */
export function letterForKey(key: string): string | null {
  return key.length === 1 ? normalizeLetter(key) : null;
}

export interface KeyOptions {
  /** Auto-repeat from a held key: owned, but applied only once. */
  readonly repeat?: boolean;
}

export interface KeyOutcome {
  /** The active mode owns this key, so the browser default is suppressed. */
  readonly owned: boolean;
  /** The game acted on it; repeats and unowned keys do not. */
  readonly applied: boolean;
  readonly kind: 'movement' | 'letter' | null;
  readonly guess: GuessResult | null;
}

const UNOWNED: KeyOutcome = { owned: false, applied: false, kind: null, guess: null };

/**
 * Routes one key press to the active mode. Ownership is decided before the
 * repeat check, so a held arrow key keeps the page from scrolling even though
 * only the first press is applied. Letters never suppress a browser default,
 * since they scroll nothing and Ctrl/Meta/Alt shortcuts must keep working.
 */
export function handleGameKey(game: Game, key: string, options: KeyOptions = {}): KeyOutcome {
  const mode = inputModeFor(game.status);

  if (mode === 'movement') {
    const direction = directionForKey(key);
    if (!direction) {
      return UNOWNED;
    }
    const applied = options.repeat === true ? false : game.requestDirection(direction);
    return { owned: true, applied, kind: 'movement', guess: null };
  }

  if (mode === 'letters') {
    const letter = letterForKey(key);
    if (!letter) {
      return UNOWNED;
    }
    if (options.repeat === true) {
      return { owned: true, applied: false, kind: 'letter', guess: null };
    }
    const guess = game.guess(letter);
    return { owned: true, applied: guess.outcome !== 'ignored', kind: 'letter', guess };
  }

  return UNOWNED;
}

/**
 * Applies a movement key. Returns true when the game consumed it, which is also
 * the signal for the DOM adapter to suppress page scrolling. Keys are ignored
 * outside the chase, so neither the title screen nor guessing moves the player.
 */
export function handleMovementKey(game: Game, key: string): boolean {
  const outcome = handleGameKey(game, key);
  return outcome.kind === 'movement' && outcome.applied;
}

/** Applies a directional pad press. Pad and keyboard share the same rules. */
export function handlePadDirection(game: Game, direction: Direction): boolean {
  return game.requestDirection(direction);
}

/** Applies a letter button press. Touch, mouse and keyboard share the same rules. */
export function handleLetterButton(game: Game, letter: string): GuessResult {
  return game.guess(letter);
}
