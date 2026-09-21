import { describe, expect, it } from 'vitest';
import { CAMPAIGN_LENGTH, LEVELS, LevelConfigError, levelDefinition } from '../src/game/levels.js';

describe('campaign levels', () => {
  it('defines exactly five levels with climbing word length and enemy speed', () => {
    expect(CAMPAIGN_LENGTH).toBe(5);
    expect(LEVELS).toHaveLength(5);
    expect(LEVELS.map((level) => level.wordLength)).toEqual([4, 5, 6, 7, 8]);

    for (let index = 1; index < LEVELS.length; index += 1) {
      const previous = LEVELS[index - 1]!;
      const current = LEVELS[index]!;
      expect(current.enemySpeedFactor).toBeGreaterThan(previous.enemySpeedFactor);
      expect(current.level).toBe(previous.level + 1);
    }
  });

  it('keeps every enemy speed factor below the returning speed, so the contact bound stays valid', () => {
    for (const level of LEVELS) {
      expect(level.enemySpeedFactor).toBeLessThan(1.25);
    }
  });

  it('looks up a level definition by its 1-based number', () => {
    expect(levelDefinition(1)).toEqual(LEVELS[0]);
    expect(levelDefinition(5)).toEqual(LEVELS[4]);
  });

  it('throws for a level outside the campaign', () => {
    expect(() => levelDefinition(0)).toThrow(LevelConfigError);
    expect(() => levelDefinition(6)).toThrow(LevelConfigError);
  });
});
