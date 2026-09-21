import { pickRandom, type RandomSource } from './random.js';

export interface WordEntry {
  /** Upper-case A–Z only, 4–8 letters. */
  readonly word: string;
  readonly category: string;
}

/**
 * M2 seed list: enough categorized words to play a round, including several
 * with repeated letters. The curated 50-word bank, difficulty progression and
 * no-repeat campaign selection are M4 work.
 */
export const SEED_WORDS: readonly WordEntry[] = [
  { word: 'APPLE', category: 'Fruit' },
  { word: 'GUITAR', category: 'Music' },
  { word: 'PLANET', category: 'Space' },
  { word: 'BALLOON', category: 'Party' },
  { word: 'RIVER', category: 'Nature' },
  { word: 'COFFEE', category: 'Drinks' },
  { word: 'PENGUIN', category: 'Animals' },
  { word: 'MIRROR', category: 'Household' },
];

export const ALPHABET: readonly string[] = Array.from({ length: 26 }, (_, index) =>
  String.fromCharCode(65 + index),
);

const WORD_PATTERN = /^[A-Z]{4,8}$/;

export class WordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WordValidationError';
  }
}

/** Rejects a word that breaks the PRD's 4–8 ASCII letter rule. */
export function validateWordEntry(entry: WordEntry): WordEntry {
  if (!WORD_PATTERN.test(entry.word)) {
    throw new WordValidationError(
      `word ${JSON.stringify(entry.word)} must be 4 to 8 upper-case A–Z letters`,
    );
  }
  if (entry.category.trim().length === 0) {
    throw new WordValidationError(`word ${entry.word} has no category`);
  }
  return entry;
}

/** Picks one seed word. A later round may repeat it; uniqueness arrives in M4. */
export function selectSeedWord(random: RandomSource): WordEntry {
  const entry = pickRandom(SEED_WORDS, random) ?? (SEED_WORDS[0] as WordEntry);
  return validateWordEntry(entry);
}

/** Case/trim-insensitive identity for the used-word set and bank uniqueness. */
export function normalizeWordKey(word: string): string {
  return word.trim().toUpperCase();
}

export interface WordBankOptions {
  /** Word lengths the bank must cover; defaults to the campaign's 4–8. */
  readonly lengths?: readonly number[];
  /** Minimum entries required per length; defaults to 10. */
  readonly minPerLength?: number;
}

/**
 * Validates every entry, rejects a word repeated anywhere in the bank
 * (case/trim-insensitive), and requires at least `minPerLength` entries for
 * each length the campaign needs. Broken or thin content fails loudly here,
 * at load, rather than surfacing later as a silent repeat or a stuck level.
 */
export function validateWordBank(
  bank: readonly WordEntry[],
  options: WordBankOptions = {},
): readonly WordEntry[] {
  const lengths = options.lengths ?? [4, 5, 6, 7, 8];
  const minPerLength = options.minPerLength ?? 10;

  const seen = new Set<string>();
  for (const entry of bank) {
    validateWordEntry(entry);
    const key = normalizeWordKey(entry.word);
    if (seen.has(key)) {
      throw new WordValidationError(`word ${entry.word} is duplicated in the bank`);
    }
    seen.add(key);
  }
  for (const length of lengths) {
    const count = bank.filter((entry) => entry.word.length === length).length;
    if (count < minPerLength) {
      throw new WordValidationError(
        `word bank has only ${count} words of length ${length}, need at least ${minPerLength}`,
      );
    }
  }
  return bank;
}

/**
 * The campaign word bank: at least ten curated, categorized, unique words for
 * each length from 4 to 8 letters, validated at module load so a broken entry
 * fails the build rather than surfacing as a repeat or a stuck level. Level
 * `N` draws from the entries of length `N + 3`.
 */
export const WORD_BANK: readonly WordEntry[] = validateWordBank([
  // 4 letters
  { word: 'FISH', category: 'Animals' },
  { word: 'BIRD', category: 'Animals' },
  { word: 'WOLF', category: 'Animals' },
  { word: 'BEAR', category: 'Animals' },
  { word: 'DUCK', category: 'Animals' },
  { word: 'FROG', category: 'Animals' },
  { word: 'GOAT', category: 'Animals' },
  { word: 'MOON', category: 'Space' },
  { word: 'STAR', category: 'Space' },
  { word: 'CAKE', category: 'Food' },
  // 5 letters
  { word: 'APPLE', category: 'Fruit' },
  { word: 'MANGO', category: 'Fruit' },
  { word: 'GRAPE', category: 'Fruit' },
  { word: 'HORSE', category: 'Animals' },
  { word: 'TIGER', category: 'Animals' },
  { word: 'RIVER', category: 'Nature' },
  { word: 'CLOUD', category: 'Weather' },
  { word: 'BREAD', category: 'Food' },
  { word: 'CHAIR', category: 'Household' },
  { word: 'PLANT', category: 'Nature' },
  // 6 letters
  { word: 'GUITAR', category: 'Music' },
  { word: 'PLANET', category: 'Space' },
  { word: 'ORANGE', category: 'Fruit' },
  { word: 'YELLOW', category: 'Colors' },
  { word: 'CASTLE', category: 'Travel' },
  { word: 'GARDEN', category: 'Nature' },
  { word: 'RABBIT', category: 'Animals' },
  { word: 'BASKET', category: 'Household' },
  { word: 'CAMERA', category: 'Technology' },
  { word: 'DESERT', category: 'Nature' },
  // 7 letters
  { word: 'BALLOON', category: 'Party' },
  { word: 'PENGUIN', category: 'Animals' },
  { word: 'DOLPHIN', category: 'Ocean' },
  { word: 'KITCHEN', category: 'Household' },
  { word: 'JOURNEY', category: 'Travel' },
  { word: 'RAINBOW', category: 'Weather' },
  { word: 'BICYCLE', category: 'Sports' },
  { word: 'CHICKEN', category: 'Food' },
  { word: 'STADIUM', category: 'Sports' },
  { word: 'BLANKET', category: 'Household' },
  // 8 letters
  { word: 'ELEPHANT', category: 'Animals' },
  { word: 'MOUNTAIN', category: 'Nature' },
  { word: 'COMPUTER', category: 'Technology' },
  { word: 'SANDWICH', category: 'Food' },
  { word: 'BACKPACK', category: 'Travel' },
  { word: 'DINOSAUR', category: 'Animals' },
  { word: 'FOOTBALL', category: 'Sports' },
  { word: 'UMBRELLA', category: 'Weather' },
  { word: 'SUNSHINE', category: 'Weather' },
  { word: 'KEYBOARD', category: 'Technology' },
]);

/**
 * Picks a random unused word of `length` from `bank`. Throws rather than
 * looping or silently repeating when the pool is empty, which only happens
 * with invalid or insufficient custom test content: the curated bank always
 * has ten entries per campaign length and a run only ever draws one per
 * length.
 */
export function selectWordForLevel(
  bank: readonly WordEntry[],
  length: number,
  excluded: ReadonlySet<string>,
  random: RandomSource,
): WordEntry {
  const pool = bank.filter(
    (entry) => entry.word.length === length && !excluded.has(normalizeWordKey(entry.word)),
  );
  const entry = pickRandom(pool, random);
  if (!entry) {
    throw new WordValidationError(`no unused ${length}-letter word is available in the bank`);
  }
  return validateWordEntry(entry);
}

/** A selector that always returns the same word, for tests and fixtures. */
export function fixedWord(word: string, category: string): () => WordEntry {
  const entry = validateWordEntry({ word: word.toUpperCase(), category });
  return () => entry;
}

/** Uppercases a single A–Z guess; anything else is not a letter. */
export function normalizeLetter(input: string): string | null {
  const letter = input.toUpperCase();
  return /^[A-Z]$/.test(letter) ? letter : null;
}

/** Positions still hidden are `null`, so a mask never leaks the answer. */
export function maskWord(word: string, revealed: ReadonlySet<string>): (string | null)[] {
  return [...word].map((letter) => (revealed.has(letter) ? letter : null));
}

export function isWordSolved(word: string, revealed: ReadonlySet<string>): boolean {
  return [...word].every((letter) => revealed.has(letter));
}

/** How many positions a letter would reveal; zero when the letter is absent. */
export function countOccurrences(word: string, letter: string): number {
  let count = 0;
  for (const character of word) {
    if (character === letter) count += 1;
  }
  return count;
}
