import { describe, expect, it } from 'vitest';
import { actorTile } from '../src/game/actor.js';
import { actorSeparation } from '../src/game/ball.js';
import { DEFAULT_CONFIG, fastestSpeedFactor } from '../src/game/config.js';
import { DIRECTIONS } from '../src/game/direction.js';
import { Game } from '../src/game/game.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { neighbor, samePosition, type GridPosition } from '../src/game/maze.js';
import {
  arenaEnemy,
  arenaMaze,
  ballAt,
  createTestGame,
  placeEnemy,
  placeEnemyOnPlayer,
  placePlayer,
  runForMs,
  runUntil,
  seamArenaMaze,
  steerPlayerTo,
  STEP_SECONDS,
} from './fixtures.js';

const ALL_IDS = ['chaser', 'ambusher', 'patroller', 'prowler'] as const;
const PELLET: GridPosition = { col: 1, row: 1 };

/** An arena round whose enemies stay home until a check puts one somewhere. */
function contactGame(
  ids: readonly (typeof ALL_IDS)[number][] = ['chaser'],
  options: Parameters<typeof createTestGame>[1] = {},
): Game {
  const game = createTestGame(arenaMaze(), {
    selectBallSpawn: () => null,
    enemies: ids.map((kind) => arenaEnemy(kind, { releaseDelayMs: 10 * 60 * 1000 })),
    ...options,
  });
  game.startLevel();
  return game;
}

/** A seam arena round with one parked enemy, for tunnel-distance checks. */
function seamGame(): Game {
  const game = createTestGame(seamArenaMaze(), {
    selectBallSpawn: () => null,
    enemies: [
      arenaEnemy('chaser', { scatterTarget: { col: 5, row: 5 }, releaseDelayMs: 10 * 60 * 1000 }),
    ],
  });
  game.startLevel();
  return game;
}

describe('substep ordering', () => {
  it('lets a pellet reached on the same slice protect before the contact', () => {
    const game = contactGame();
    // The player is a single slice away from the pellet, with the enemy
    // standing on it: movement, the pellet and the contact all land together.
    placePlayer(game, { col: PELLET.col + 0.05, row: PELLET.row }, 'left');
    placeEnemy(game, 'chaser', PELLET, 'roaming');
    const before = game.lives;

    game.step(STEP_SECONDS);
    expect(game.hasPowerPellet(PELLET)).toBe(false);

    // Collectibles are resolved before contacts, so this is an eat, not a death.
    expect(game.status).toBe('chase');
    expect(game.lives).toBe(before);
    expect(game.snapshot().enemiesEaten).toBe(1);
    expect(game.snapshot().frightenedRemainingMs).toBeGreaterThan(0);
  });

  it('makes a lethal contact beat a ball capture on the same slice', () => {
    const at: GridPosition = { col: 3, row: 6 };
    const game = contactGame(['chaser'], { selectBallSpawn: ballAt(at) });
    placePlayer(game, at);
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    const ball = game.ball;
    if (!ball) throw new Error('the fixture must place a ball');
    ball.x = at.col;
    ball.y = at.row;

    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives - 1);
    // Guessing never opened, so the round's word state is untouched.
    expect(game.snapshot().word.revealedLetters).toEqual([]);
  });

  it('awards nothing for an eat on a slice whose contact is lethal', () => {
    const game = contactGame(ALL_IDS);
    steerPlayerTo(game, PELLET);
    runUntil(game, () => game.snapshot().frightenedRemainingMs === 0, 8000);

    const score = game.score;
    for (const id of ALL_IDS) {
      placeEnemyOnPlayer(game, id, 'roaming');
    }
    game.step(STEP_SECONDS);

    expect(game.status).toBe('dying');
    expect(game.score).toBe(score);
    expect(game.snapshot().enemiesEaten).toBe(0);
  });

  it('costs one life however many lethal enemies are touched at once', () => {
    const game = contactGame(ALL_IDS);
    for (const id of ALL_IDS) {
      placeEnemyOnPlayer(game, id, 'roaming');
    }
    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives - 1);

    // The frozen death presentation cannot take a second life either.
    runForMs(game, 300);
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives - 1);
  });

  it('ends the slice at a death, leaving nothing to leak into the frozen state', () => {
    const game = contactGame(['chaser'], { selectBallSpawn: ballAt({ col: 8, row: 6 }) });
    placePlayer(game, { col: 3, row: 6 }, 'right');
    placeEnemyOnPlayer(game, 'chaser', 'roaming');
    const parked = game.snapshot();

    game.step(STEP_SECONDS);
    const dying = game.snapshot();
    expect(dying.status).toBe('dying');
    expect(dying.score).toBe(parked.score);

    // Nothing but the presentation timer moves from here.
    game.step(STEP_SECONDS);
    const later = game.snapshot();
    expect(later.player).toEqual(dying.player);
    expect(later.ball).toEqual(dying.ball);
    expect(later.enemies).toEqual(dying.enemies);
    expect(later.dyingRemainingMs).toBeLessThan(dying.dyingRemainingMs);
  });
});

describe('bounded contact', () => {
  it('catches a head-on approach inside one very long step', () => {
    // A whole second in a single call: the player and an enemy close from
    // opposite ends of the bottom corridor and must touch, not swap sides.
    const game = contactGame();
    placePlayer(game, { col: 2, row: 6 }, 'right');
    game.requestDirection('right');
    placeEnemy(game, 'chaser', { col: 8, row: 6 }, 'roaming', 'left');

    game.step(1);
    expect(game.status).toBe('dying');
    expect(game.lives).toBe(DEFAULT_CONFIG.startingLives - 1);
  });

  it('bounds a slice by the fastest actor, which is an enemy going home', () => {
    expect(fastestSpeedFactor(DEFAULT_CONFIG)).toBe(DEFAULT_CONFIG.returningSpeedFactor);
    expect(DEFAULT_CONFIG.returningSpeedFactor).toBeGreaterThan(1);

    // One long call and many short ones put the fastest actor in the same place.
    const long = contactGame();
    const short = contactGame();
    for (const game of [long, short]) {
      placeEnemy(game, 'chaser', { col: 9, row: 6 }, 'returning', 'left');
    }
    long.step(0.5);
    runForMs(short, 500);

    const a = long.snapshot().enemies[0];
    const b = short.snapshot().enemies[0];
    expect(a?.x).toBeCloseTo(b?.x ?? Number.NaN, 6);
    expect(a?.y).toBeCloseTo(b?.y ?? Number.NaN, 6);
    expect(a?.state).toBe(b?.state);
  });

  it('measures the tunnel seam the short way only on a tunnel row', () => {
    const game = seamGame();
    const maze = game.maze;
    const player = game.player;
    const enemy = game.enemies[0]?.actor;
    if (!enemy) throw new Error('the seam arena must carry one enemy');

    // Both on the tunnel row, a fifth of a tile apart across the seam.
    player.x = 0.1;
    player.y = 1;
    enemy.x = maze.width - 0.1;
    enemy.y = 1;
    expect(actorSeparation(maze, player, enemy)).toBeCloseTo(0.2, 6);

    // The same coordinates on an ordinary row are the width of the maze apart.
    player.y = 5;
    enemy.y = 5;
    expect(actorSeparation(maze, player, enemy)).toBeCloseTo(maze.width - 0.2, 6);
  });

  it('kills across the tunnel seam', () => {
    const game = seamGame();
    const maze = game.maze;

    // A third of a tile apart, but on opposite sides of the seam. The wrapped
    // distance is what decides, exactly as it does for a ball capture.
    placePlayer(game, { col: 0, row: 1 }, 'left');
    placeEnemy(game, 'chaser', { col: maze.width - 0.3, row: 1 }, 'roaming', 'left');
    game.step(STEP_SECONDS);
    expect(game.status).toBe('dying');

    // Two actors the same distance apart in columns, but off the tunnel row,
    // are the width of the maze apart rather than adjacent; the separation
    // check above covers that case, which no legal position can produce here.
  });

  it('only ever kills from a tile the player could legally have walked to', () => {
    // Three real deaths in the authored maze, each one checked against the
    // traversal graph: a contact can never reach through a wall.
    const game = createTestGame(createLevelOneMaze(), { selectBallSpawn: () => null });
    game.startLevel();

    let deaths = 0;
    for (let i = 0; i < 120 * 90 && deaths < 3; i += 1) {
      const before = game.status;
      game.step(STEP_SECONDS);
      if (before !== 'chase' || game.status !== 'dying') continue;

      deaths += 1;
      const playerTile = actorTile(game.maze, game.player);
      const touching = game.enemies.filter(
        (enemy) =>
          enemy.state === 'roaming' &&
          actorSeparation(game.maze, game.player, enemy.actor) <=
            DEFAULT_CONFIG.enemyContactRadiusTiles,
      );
      expect(touching.length).toBeGreaterThan(0);
      for (const enemy of touching) {
        const enemyTile = actorTile(game.maze, enemy.actor);
        const connected =
          samePosition(enemyTile, playerTile) ||
          DIRECTIONS.some((direction) => {
            const next = neighbor(game.maze, playerTile, direction);
            return next !== null && samePosition(next, enemyTile);
          });
        expect(connected).toBe(true);
      }
    }
    expect(deaths).toBe(3);
  });
});
