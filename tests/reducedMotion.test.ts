import { describe, expect, it, vi } from 'vitest';
import { ReducedMotionWatcher, type MatchMediaLike, type MediaQuerySource } from '../src/app/reducedMotion.js';

function fakeMatchMedia(initial: boolean): { matchMedia: MatchMediaLike; fire: (matches: boolean) => void } {
  let listener: ((event: { matches: boolean }) => void) | null = null;
  const query: MediaQuerySource = {
    matches: initial,
    addEventListener: (_type, callback) => {
      listener = callback;
    },
    removeEventListener: () => {
      listener = null;
    },
  };
  return {
    matchMedia: () => query,
    fire: (matches) => {
      query.matches = matches;
      listener?.({ matches });
    },
  };
}

describe('ReducedMotionWatcher', () => {
  it('reads the initial preference', () => {
    const { matchMedia } = fakeMatchMedia(true);
    expect(new ReducedMotionWatcher(matchMedia, () => {}).reducedMotion).toBe(true);
  });

  it('defaults to normal motion when matchMedia is unavailable', () => {
    expect(new ReducedMotionWatcher(undefined, () => {}).reducedMotion).toBe(false);
  });

  it('tracks a runtime preference change and notifies the callback', () => {
    const { matchMedia, fire } = fakeMatchMedia(false);
    const onChange = vi.fn();
    const watcher = new ReducedMotionWatcher(matchMedia, onChange);
    expect(watcher.reducedMotion).toBe(false);

    fire(true);
    expect(watcher.reducedMotion).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);

    fire(false);
    expect(watcher.reducedMotion).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
