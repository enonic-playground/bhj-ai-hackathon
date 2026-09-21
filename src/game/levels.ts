/** One campaign level's fixed word length and enemy speed. */
export interface LevelDefinition {
  readonly level: number;
  readonly wordLength: number;
  readonly enemySpeedFactor: number;
}

export class LevelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LevelConfigError';
  }
}

/**
 * Five immutable levels: word length climbs 4 to 8 letters and roaming enemy
 * speed rises in small, conservative steps. These are D017's starting values,
 * pending human playtesting; tuning them is recorded as a decision, not a
 * silent edit.
 */
export const LEVELS: readonly LevelDefinition[] = [
  { level: 1, wordLength: 4, enemySpeedFactor: 0.75 },
  { level: 2, wordLength: 5, enemySpeedFactor: 0.78 },
  { level: 3, wordLength: 6, enemySpeedFactor: 0.81 },
  { level: 4, wordLength: 7, enemySpeedFactor: 0.84 },
  { level: 5, wordLength: 8, enemySpeedFactor: 0.87 },
];

export const CAMPAIGN_LENGTH = LEVELS.length;

/** The definition for `level` (1-based); throws for a level outside the campaign. */
export function levelDefinition(level: number): LevelDefinition {
  const definition = LEVELS[level - 1];
  if (!definition) {
    throw new LevelConfigError(`no level definition for level ${level}`);
  }
  return definition;
}
