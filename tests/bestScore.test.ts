import { describe, expect, it } from 'vitest';
import { BestScoreStore, resolveLocalStorage, type StorageLike } from '../src/app/bestScore.js';

/** An in-memory `StorageLike`, so real storage semantics are exercised without the DOM. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
}

const KEY = 'hacman.bestScore.v1';

describe('BestScoreStore', () => {
  it('starts at zero with no storage at all', () => {
    const store = new BestScoreStore(null);
    expect(store.best).toBe(0);
  });

  it('reads a previously saved best on construction', () => {
    const storage = memoryStorage({ [KEY]: JSON.stringify({ version: 1, score: 4200 }) });
    expect(new BestScoreStore(storage).best).toBe(4200);
  });

  it('persists only when a new run improves the stored best', () => {
    const storage = memoryStorage();
    const store = new BestScoreStore(storage);

    store.record(100);
    expect(store.best).toBe(100);
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({ version: 1, score: 100 });

    store.record(50); // A lower run score must never overwrite a higher best.
    expect(store.best).toBe(100);
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({ version: 1, score: 100 });

    store.record(100); // Equal, not an improvement.
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({ version: 1, score: 100 });

    store.record(250);
    expect(store.best).toBe(250);
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({ version: 1, score: 250 });
  });

  it('a later store never loses an improvement made by an earlier one', () => {
    const storage = memoryStorage();
    new BestScoreStore(storage).record(300);
    const second = new BestScoreStore(storage);
    expect(second.best).toBe(300);
    second.record(100);
    expect(JSON.parse(storage.getItem(KEY) as string).score).toBe(300);
  });

  it('a stale tab, opened before either has scored, cannot overwrite a higher best saved meanwhile', () => {
    const storage = memoryStorage();
    const tabA = new BestScoreStore(storage);
    const tabB = new BestScoreStore(storage); // Both open against one empty backend.

    tabA.record(10_000);
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({ version: 1, score: 10_000 });

    // Tab B still thinks the best is 0: its own smaller run score must not win.
    tabB.record(10);
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({ version: 1, score: 10_000 });
    expect(tabB.best).toBe(10_000); // Reconciled with the stored best, not overwritten by 10.

    // Tab B's own next, genuine improvement still saves normally afterwards.
    tabB.record(20_000);
    expect(JSON.parse(storage.getItem(KEY) as string)).toEqual({ version: 1, score: 20_000 });
  });

  for (const [label, raw] of [
    ['absent', null],
    ['malformed JSON', '{not json'],
    ['not an object', '"just a string"'],
    ['negative score', JSON.stringify({ version: 1, score: -5 })],
    ['non-finite score', JSON.stringify({ version: 1, score: Number.POSITIVE_INFINITY })],
    ['fractional score', JSON.stringify({ version: 1, score: 12.5 })],
    ['wrong version', JSON.stringify({ version: 2, score: 500 })],
    ['missing version', JSON.stringify({ score: 500 })],
  ] as const) {
    it(`treats ${label} stored data as no saved best`, () => {
      const storage = memoryStorage(raw === null ? {} : { [KEY]: raw });
      expect(new BestScoreStore(storage).best).toBe(0);
    });
  }

  it('rejects an invalid or worse score passed to record, without touching storage', () => {
    const storage = memoryStorage();
    const store = new BestScoreStore(storage);
    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
      store.record(bad);
    }
    expect(store.best).toBe(0);
    expect(storage.getItem(KEY)).toBeNull();
  });

  it('falls back to zero, without throwing, when reading throws', () => {
    expect(new BestScoreStore(throwingStorage()).best).toBe(0);
  });

  it('keeps working in memory for the rest of the session when writing throws', () => {
    const store = new BestScoreStore(throwingStorage());
    expect(() => store.record(500)).not.toThrow();
    expect(store.best).toBe(500); // The in-memory best still works.
  });
});

/** `resolveLocalStorage` probes with `removeItem` too, which `StorageLike` does not require. */
interface ProbeableStorage extends StorageLike {
  removeItem(key: string): void;
}

function probeableStorage(): ProbeableStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function throwingProbeableStorage(): ProbeableStorage {
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => undefined,
  };
}

/**
 * Installs a fake `window.localStorage` for the duration of `run`, bypassing
 * the DOM lib's full `Storage` typing: this environment has no real `window`
 * at all, so `defineProperty` is what actually reaches `resolveLocalStorage`
 * at runtime, and the type-level shape is deliberately not the concern here.
 */
function withWindowStorage(localStorage: ProbeableStorage, run: () => void): void {
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage },
    configurable: true,
  });
  try {
    run();
  } finally {
    Reflect.deleteProperty(globalThis, 'window');
  }
}

describe('resolveLocalStorage', () => {
  it('returns null outside a browser environment rather than throwing', () => {
    expect(resolveLocalStorage()).toBeNull();
  });

  it('returns the storage after a successful round-trip probe', () => {
    const probe = probeableStorage();
    withWindowStorage(probe, () => {
      expect(resolveLocalStorage()).toBe(probe);
    });
  });

  it('returns null when the probe write throws, e.g. a full or denied backend', () => {
    withWindowStorage(throwingProbeableStorage(), () => {
      expect(resolveLocalStorage()).toBeNull();
    });
  });
});
