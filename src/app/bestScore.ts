/** Minimal surface `localStorage` and a fixture double both satisfy. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'hacman.bestScore.v1';
const STORAGE_VERSION = 1;

interface StoredBestScore {
  readonly version: number;
  readonly score: number;
}

function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** Anything absent, malformed, negative, non-finite or the wrong version reads as no saved best. */
function parseBestScore(raw: string | null): number {
  if (raw === null) {
    return 0;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    const record = parsed as Partial<StoredBestScore> | null;
    if (record && typeof record === 'object' && record.version === STORAGE_VERSION && isValidScore(record.score)) {
      return record.score;
    }
  } catch {
    // Malformed JSON reads as no saved best.
  }
  return 0;
}

/**
 * Reads and writes the local best score, treating every storage failure — a
 * denied, unavailable or throwing backend, or invalid stored data — as no
 * saved best rather than letting it interrupt play. The in-memory best still
 * works for the rest of the session even when persistence never succeeds, and
 * a lower run score never overwrites a higher stored one.
 */
export class BestScoreStore {
  readonly #storage: StorageLike | null;
  #best: number;

  constructor(storage: StorageLike | null) {
    this.#storage = storage;
    this.#best = this.#readSafely();
  }

  get best(): number {
    return this.#best;
  }

  /** Records a run's score; persists only when it actually improves the stored best. */
  record(score: number): void {
    if (!isValidScore(score) || score <= this.#best) {
      return;
    }
    this.#best = score;
    this.#writeSafely(score);
  }

  #readSafely(): number {
    if (!this.#storage) {
      return 0;
    }
    try {
      return parseBestScore(this.#storage.getItem(STORAGE_KEY));
    } catch {
      return 0;
    }
  }

  #writeSafely(score: number): void {
    if (!this.#storage) {
      return;
    }
    try {
      const record: StoredBestScore = { version: STORAGE_VERSION, score };
      this.#storage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch {
      // Denied or quota-exceeded storage must not interrupt play.
    }
  }
}

/**
 * `window.localStorage` itself can throw on access in some browser privacy
 * modes, and a backend can exist but silently reject writes, so this probes
 * a round trip rather than trusting the getter alone.
 */
export function resolveLocalStorage(): StorageLike | null {
  try {
    const storage = window.localStorage;
    const probeKey = '__hacman_storage_check__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}
