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
