import { describe, expect, it } from 'vitest';
import { createSeededRandom } from '../src/game/random.js';
import {
  ALPHABET,
  SEED_WORDS,
  WordValidationError,
  countOccurrences,
  isWordSolved,
  maskWord,
  normalizeLetter,
  selectSeedWord,
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

  it('selects a valid word and repeats a seeded sequence exactly', () => {
    const first = Array.from({ length: 5 }, (_, index) =>
      selectSeedWord(createSeededRandom(index)),
    );
    const second = Array.from({ length: 5 }, (_, index) =>
      selectSeedWord(createSeededRandom(index)),
    );
    expect(first).toEqual(second);
    for (const entry of first) {
      expect(SEED_WORDS).toContain(entry);
    }
  });

  it('offers all 26 letters for guessing', () => {
    expect(ALPHABET).toHaveLength(26);
    expect(ALPHABET[0]).toBe('A');
    expect(ALPHABET.at(-1)).toBe('Z');
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
