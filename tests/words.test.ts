import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../src/game/random.js';
import {
  ALPHABET,
  SEED_WORDS,
  WORD_BANK,
  WordValidationError,
  countOccurrences,
  isWordSolved,
  maskWord,
  normalizeLetter,
  normalizeWordKey,
  selectWordForLevel,
  validateWordBank,
  validateWordEntry,
} from '../src/game/words.js';

describe('seed word list', () => {
  it('holds only categorized 4 to 8 letter A–Z words', () => {
    expect(SEED_WORDS.length).toBeGreaterThanOrEqual(6);
    for (const entry of SEED_WORDS) {
      expect(() => validateWordEntry(entry)).not.toThrow();
    }
  });

  it('includes words with repeated letters', () => {
    const repeated = SEED_WORDS.filter(
      (entry) => new Set(entry.word).size < entry.word.length,
    );
    expect(repeated.length).toBeGreaterThan(0);
  });

  it('rejects words outside the PRD letter rules', () => {
    for (const word of ['CAT', 'ELEPHANTS', 'CAFÉ', 'two words', 'apple']) {
      expect(() => validateWordEntry({ word, category: 'Test' })).toThrow(WordValidationError);
    }
    expect(() => validateWordEntry({ word: 'APPLE', category: '  ' })).toThrow(WordValidationError);
  });

  it('offers all 26 letters for guessing', () => {
    expect(ALPHABET).toHaveLength(26);
    expect(ALPHABET[0]).toBe('A');
    expect(ALPHABET.at(-1)).toBe('Z');
  });
});

describe('campaign word bank', () => {
  it('holds at least ten unique categorized words for every campaign length', () => {
    for (const length of [4, 5, 6, 7, 8]) {
      const entries = WORD_BANK.filter((entry) => entry.word.length === length);
      expect(entries.length).toBeGreaterThanOrEqual(10);
      for (const entry of entries) {
        expect(() => validateWordEntry(entry)).not.toThrow();
      }
    }
    expect(WORD_BANK.length).toBeGreaterThanOrEqual(50);
  });

  it('never repeats a word, case- or trim-insensitively', () => {
    const keys = WORD_BANK.map((entry) => normalizeWordKey(entry.word));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rejects a bank with a duplicated word', () => {
    expect(() =>
      validateWordBank([
        { word: 'FISH', category: 'Animals' },
        { word: 'fish', category: 'Animals' },
      ]),
    ).toThrow(WordValidationError);
  });

  it('rejects a bank with too few words of a required length', () => {
    const thin = WORD_BANK.filter((entry) => entry.word.length !== 4).concat([
      { word: 'GOAT', category: 'Animals' },
    ]);
    expect(() => validateWordBank(thin)).toThrow(WordValidationError);
  });

  it('accepts a bank that meets a custom, narrower requirement', () => {
    const small = [
      { word: 'FISH', category: 'Animals' },
      { word: 'BIRD', category: 'Animals' },
    ];
    expect(validateWordBank(small, { lengths: [4], minPerLength: 2 })).toBe(small);
  });

  it('selects an unused word of the requested length and repeats a seeded sequence exactly', () => {
    const excluded = new Set<string>();
    const first = selectWordForLevel(WORD_BANK, 5, excluded, createSeededRandom(3));
    expect(first.word).toHaveLength(5);
    const second = selectWordForLevel(WORD_BANK, 5, excluded, createSeededRandom(3));
    expect(second).toEqual(first);
  });

  it('never selects a word already excluded', () => {
    // Callers, such as the game's used-word set, always normalize what they
    // exclude, so the set here is already upper-case.
    const excluded = new Set(['FISH']);
    for (let seed = 0; seed < 20; seed += 1) {
      const entry = selectWordForLevel(WORD_BANK, 4, excluded, createSeededRandom(seed));
      expect(entry.word).not.toBe('FISH');
    }
  });

  it('throws rather than looping when the pool is exhausted', () => {
    const allFourLetterWords = new Set(
      WORD_BANK.filter((entry) => entry.word.length === 4).map((entry) => normalizeWordKey(entry.word)),
    );
    expect(() => selectWordForLevel(WORD_BANK, 4, allFourLetterWords, createSeededRandom(1))).toThrow(
      WordValidationError,
    );
  });
});

describe('letter input', () => {
  it('accepts single A–Z letters in either case', () => {
    expect(normalizeLetter('a')).toBe('A');
    expect(normalizeLetter('Z')).toBe('Z');
  });

  it('rejects anything that is not one letter', () => {
    for (const input of ['', 'ab', '4', ' ', '-', 'É', 'Enter', 'ArrowUp']) {
      expect(normalizeLetter(input)).toBeNull();
    }
  });
});

describe('word mask', () => {
  it('hides every unguessed position', () => {
    expect(maskWord('APPLE', new Set())).toEqual([null, null, null, null, null]);
  });

  it('reveals every occurrence of a revealed letter at once', () => {
    expect(maskWord('APPLE', new Set(['P']))).toEqual([null, 'P', 'P', null, null]);
    expect(countOccurrences('APPLE', 'P')).toBe(2);
    expect(countOccurrences('APPLE', 'Z')).toBe(0);
  });

  it('is solved only when every distinct letter is revealed', () => {
    expect(isWordSolved('APPLE', new Set(['A', 'P', 'L']))).toBe(false);
    expect(isWordSolved('APPLE', new Set(['A', 'P', 'L', 'E']))).toBe(true);
    // A repeated letter needs one guess, not one per position.
    expect(maskWord('APPLE', new Set(['A', 'P', 'L', 'E']))).toEqual(['A', 'P', 'P', 'L', 'E']);
  });
});
