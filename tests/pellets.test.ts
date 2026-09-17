import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import type { Enemy } from '../src/game/enemy.js';
import { Game } from '../src/game/game.js';
import { positionKey, type GridPosition } from '../src/game/maze.js';
import {
  arenaEnemy,
  arenaMaze,
  createTestGame,
  placeEnemy,
  placeEnemyOnPlayer,
  placePlayer,
  runForMs,
  runUntil,
  steerPlayerTo,
  STEP_SECONDS,
} from './fixtures.js';

const FIRST_PELLET: GridPosition = { col: 1, row: 1 };
const SECOND_PELLET: GridPosition = { col: 9, row: 1 };
const ALL_IDS = ['chaser', 'ambusher', 'patroller', 'prowler'] as const;

/** Slices of frightened time left when the effect has one whole slice to run. */
const ONE_SLICE_MS = DEFAULT_CONFIG.simulationStepMs;

/**
 * An arena round whose enemies stay home unless a check puts one somewhere, so
 * a contact happens at a known place and moment instead of by chance.
 */
function pelletGame(ids: readonly (typeof ALL_IDS)[number][] = ['chaser']): Game {
  const game = createTestGame(arenaMaze(), {
    selectBallSpawn: () => null,
    enemies: ids.map((kind) => arenaEnemy(kind, { releaseDelayMs: 10 * 60 * 1000 })),
  });
  game.startLevel();
  return game;
}

function enemyOf(game: Game, id: string): Enemy {
  const enemy = game.enemies.find((candidate) => candidate.definition.id === id);
  if (!enemy) throw new Error(`no enemy ${id}`);
  return enemy;
}

describe('power pellets', () => {
  it('scores 50 once and starts six seconds of frightened time', () => {
    const game = pelletGame();
    expect(game.pelletsRemaining).toBe(2);
    expect(game.hasPowerPellet(FIRST_PELLET)).toBe(true);

    steerPlayerTo(game, FIRST_PELLET);
    expect(game.snapshot().frightenedRemainingMs).toBe(DEFAULT_CONFIG.frightenedMs);
    expect(game.pelletsRemaining).toBe(1);

    // The tile carried a pellet instead of a dot, so exactly one award landed.
    const dotsEaten = game.maze.dotTiles.length - game.dotsRemaining;
    expect(game.score).toBe(dotsEaten * DEFAULT_CONFIG.dotScore + DEFAULT_CONFIG.powerPelletScore);

    // Walking over the emptied tile again awards nothing: no second pellet,
    // and no dot underneath it either.
    const afterFirst = game.score;
    placePlayer(game, { col: 2, row: 1 }, 'left');
    steerPlayerTo(game, FIRST_PELLET);
    expect(game.score).toBe(afterFirst);
  });

  it('counts frightened time in active chase seconds only', () => {
    const game = pelletGame();
    steerPlayerTo(game, FIRST_PELLET);
    runForMs(game, 2000);
    const parked = game.snapshot().frightenedRemainingMs;
    expect(parked).toBeCloseTo(DEFAULT_CONFIG.frightenedMs - 2000, 6);

    game.pause();
    runForMs(game, 5000);
    expect(game.snapshot().frightenedRemainingMs).toBe(parked);
    game.resume();

    runForMs(game, 4100);
    expect(game.snapshot().frightenedRemainingMs).toBe(0);
  });

  it('freezes the chase and scatter clock while the effect lasts', () => {
    const game = pelletGame();
    steerPlayerTo(game, FIRST_PELLET);
    const frozenAt = game.snapshot().phaseRemainingMs;

    runForMs(game, 3000);
    expect(game.snapshot().phaseRemainingMs).toBe(frozenAt);
    expect(game.enemyPhase).toBe('scatter');

    // The whole six seconds pass without the phase clock moving at all.
    runForMs(game, 3000);
    expect(game.snapshot().frightenedRemainingMs).toBe(0);
    expect(game.snapshot().phaseRemainingMs).toBe(frozenAt);

    // It then picks up exactly where it was left, rather than catching up.
    runForMs(game, 500);
    expect(game.snapshot().phaseRemainingMs).toBeCloseTo(frozenAt - 500, 6);
  });

  it('refreshes rather than stacks, and restarts the score chain', () => {
    const game = pelletGame();
    steerPlayerTo(game, FIRST_PELLET);
    runForMs(game, 4000);
    expect(game.snapshot().frightenedRemainingMs).toBeCloseTo(2000, 6);

    // Eat one enemy so the chain has advanced before the second pellet.
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.snapshot().enemiesEaten).toBe(1);
    expect(enemyOf(game, 'chaser').state).toBe('returning');

    steerPlayerTo(game, SECOND_PELLET);
    expect(game.pelletsRemaining).toBe(0);
    // Set to six seconds again, not added to the two that were left.
    expect(game.snapshot().frightenedRemainingMs).toBe(DEFAULT_CONFIG.frightenedMs);
    expect(game.snapshot().enemiesEaten).toBe(0);
  });
});

describe('frightened enemies', () => {
  it('halves enemy speed and makes them edible instead of lethal', () => {
    const game = pelletGame();
    const chaser = placeEnemy(game, 'chaser', { col: 5, row: 1 }, 'roaming', 'right');
    steerPlayerTo(game, FIRST_PELLET);

    const state = game.snapshot().enemies[0];
    expect(state?.edible).toBe(true);
    expect(state?.lethal).toBe(false);

    let travelled = 0;
    let previous = { x: chaser.actor.x, y: chaser.actor.y };
    for (let i = 0; i < 60; i += 1) {
      game.step(STEP_SECONDS);
      travelled += Math.abs(chaser.actor.x - previous.x) + Math.abs(chaser.actor.y - previous.y);
      previous = { x: chaser.actor.x, y: chaser.actor.y };
    }
    expect(travelled).toBeCloseTo(
      DEFAULT_CONFIG.playerSpeedTilesPerSecond *
        DEFAULT_CONFIG.frightenedSpeedFactor *
        60 *
        STEP_SECONDS,
      6,
    );
  });

  it('keeps frightened movement on legal tiles, from the injected seed', () => {
    const walkableTiles = (game: Game): Set<string> => {
      const walkable = new Set<string>();
      for (let row = 0; row < game.maze.height; row += 1) {
        for (let col = 0; col < game.maze.width; col += 1) {
          const tile = game.maze.tiles[row]?.[col];
          if (tile === 'corridor' || tile === 'tunnel') walkable.add(positionKey({ col, row }));
        }
      }
      return walkable;
    };

    const trace = (): string[] => {
      const game = pelletGame();
      const chaser = placeEnemy(game, 'chaser', { col: 5, row: 1 }, 'roaming', 'right');
      steerPlayerTo(game, FIRST_PELLET);
      const walkable = walkableTiles(game);
      const path: string[] = [];
      for (let i = 0; i < 300 && game.snapshot().frightenedRemainingMs > 0; i += 1) {
        game.step(STEP_SECONDS);
        const tile = positionKey({ col: Math.round(chaser.actor.x), row: Math.round(chaser.actor.y) });
        expect(walkable.has(tile)).toBe(true);
        path.push(tile);
      }
      return path;
    };

    // Two runs of the same seeded game take exactly the same random walk.
    expect(trace()).toEqual(trace());
  });

  it('awards 200, 400, 800 and 1600, then caps at 1600 within one effect', () => {
    const game = pelletGame(ALL_IDS);
    steerPlayerTo(game, FIRST_PELLET);
    const base = game.score;

    const awards: number[] = [];
    for (const id of ALL_IDS) {
      const before = game.score;
      placeEnemyOnPlayer(game, id, 'roaming');
      game.step(STEP_SECONDS);
      awards.push(game.score - before);
    }
    expect(awards).toEqual(DEFAULT_CONFIG.enemyEatScores);
    expect(game.score).toBe(base + 200 + 400 + 800 + 1600);

    // A fifth eat inside the same effect stays at the capped value.
    const before = game.score;
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.score - before).toBe(1600);
    expect(game.snapshot().enemiesEaten).toBe(5);
  });

  it('awards one eat per contact, however many slices the touch lasts', () => {
    const game = pelletGame();
    steerPlayerTo(game, FIRST_PELLET);

    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    const before = game.score;
    runForMs(game, 200);
    expect(game.score - before).toBe(200);
    expect(game.snapshot().enemiesEaten).toBe(1);
    expect(enemyOf(game, 'chaser').state).not.toBe('roaming');
  });

  it('cannot eat or be killed by an enemy that is waiting, leaving or going home', () => {
    const game = pelletGame();
    steerPlayerTo(game, FIRST_PELLET);

    for (const state of ['returning', 'exiting', 'resting', 'home'] as const) {
      const before = game.score;
      placeEnemyOnPlayer(game, 'chaser', state);
      game.step(STEP_SECONDS);
      expect(game.status).toBe('chase');
      expect(game.score).toBe(before);
      expect(game.snapshot().enemiesEaten).toBe(0);
    }

    // A returning enemy stays harmless once the effect has expired, too.
    runUntil(game, () => game.snapshot().frightenedRemainingMs === 0, 8000);
    placeEnemyOnPlayer(game, 'chaser', 'returning');
    runForMs(game, 100);
    expect(game.status).toBe('chase');
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives);
  });

  it('treats the slice in which the effect runs out as lethal', () => {
    const game = pelletGame();
    steerPlayerTo(game, FIRST_PELLET);

    // Stop with two whole slices of frightened time left.
    runUntil(game, () => game.snapshot().frightenedRemainingMs <= 2 * ONE_SLICE_MS + 1e-6, 8000);
    expect(game.snapshot().frightenedRemainingMs).toBeCloseTo(2 * ONE_SLICE_MS, 6);

    // The timer runs down first, so this slice still has time on it: an eat.
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.snapshot().frightenedRemainingMs).toBeCloseTo(ONE_SLICE_MS, 6);
    expect(game.snapshot().enemiesEaten).toBe(1);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives);

    // The next slice takes the timer to zero before contacts, so it is lethal.
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.snapshot().frightenedRemainingMs).toBe(0);
    expect(game.status).toBe('dying');
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives - 1);
  });

  it('lets a rejoining enemy inherit an effect that is still running', () => {
    const game = pelletGame();
    steerPlayerTo(game, FIRST_PELLET);
    expect(game.snapshot().frightenedRemainingMs).toBeGreaterThan(0);

    const rest = game.maze.home?.rest;
    if (!rest) throw new Error('the arena must author an enemy home');
    const chaser = placeEnemy(game, 'chaser', rest, 'resting');
    chaser.waitRemainingMs = 500;

    runUntil(game, () => chaser.state === 'roaming', 5000);
    const rejoined = game.snapshot().enemies[0];
    expect(game.snapshot().frightenedRemainingMs).toBeGreaterThan(0);
    expect(rejoined?.state).toBe('roaming');
    expect(rejoined?.edible).toBe(true);
    expect(rejoined?.lethal).toBe(false);
  });

  it('keeps pellets consumed across a death and out of level completion', () => {
    const game = pelletGame();
    steerPlayerTo(game, FIRST_PELLET);
    expect(game.pelletsRemaining).toBe(1);

    runUntil(game, () => game.snapshot().frightenedRemainingMs === 0, 8000);
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');
    runForMs(game, DEFAULT_CONFIG.dyingPresentationMs + 100);

    expect(game.status).toBe('chase');
    expect(game.pelletsRemaining).toBe(1); // The eaten one stays eaten.
    expect(game.hasPowerPellet(FIRST_PELLET)).toBe(false);
  });
});
