/** The minimal `matchMedia` surface this module needs, so it is testable without a DOM. */
export interface MediaQuerySource {
  matches: boolean;
  addEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: 'change', listener: (event: { matches: boolean }) => void): void;
}

export type MatchMediaLike = (query: string) => MediaQuerySource;

/**
 * Tracks the system `prefers-reduced-motion` preference (AC3), including a
 * runtime change — the OS setting can change while the app is open, and the
 * brief requires that to take effect without a reload. Falls back to `false`
 * (normal motion) when `matchMedia` is unavailable, rather than throwing.
 */
export class ReducedMotionWatcher {
  #reducedMotion: boolean;
  readonly #query: MediaQuerySource | null;

  constructor(matchMedia: MatchMediaLike | undefined, onChange: (reducedMotion: boolean) => void) {
    this.#query = matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.#reducedMotion = this.#query?.matches ?? false;
    this.#query?.addEventListener('change', (event) => {
      this.#reducedMotion = event.matches;
      onChange(this.#reducedMotion);
    });
  }

  get reducedMotion(): boolean {
    return this.#reducedMotion;
  }
}
