import { describe, expect, it } from 'vitest';
import { readTestFixture } from '../src/app/fixture.js';
import { WORD_BANK } from '../src/game/words.js';

describe('readTestFixture: testBankWord', () => {
  it('pins every level to the given WORD_BANK entry, independent of level length', () => {
    const options = readTestFixture('?testBankWord=42');
    const entry = WORD_BANK[42];
    expect(entry?.word).toBe('COMPUTER');
    expect(options.selectWord).toBeTypeOf('function');
    for (const level of [1, 2, 3, 4, 5]) {
      expect(
        options.selectWord?.({ level, wordLength: level + 3, excluded: new Set(), random: () => 0 }),
      ).toEqual(entry);
    }
  });

  it('is ignored when the index is out of range', () => {
    expect(readTestFixture(`?testBankWord=${WORD_BANK.length + 10}`).selectWord).toBeUndefined();
  });

  it('is ignored when malformed', () => {
    expect(readTestFixture('?testBankWord=not-a-number').selectWord).toBeUndefined();
  });

  it('never touches selection when absent', () => {
    expect(readTestFixture('').selectWord).toBeUndefined();
  });
});
