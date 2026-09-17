import { describe, expect, it } from 'vitest';
import { createActor } from '../src/game/actor.js';
import { oppositeDirection } from '../src/game/direction.js';
import { DEFAULT_CONFIG, DEFAULT_ENEMIES } from '../src/game/config.js';
import {
  TURN_ORDER,
  chooseTargetedDirection,
  createEnemy,
  enemyTarget,
  leadTile,
  traversalFor,
  type Enemy,
} from '../src/game/enemy.js';
import { EnemyConfigError, Game } from '../src/game/game.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { positionKey, type GridPosition, type Maze } from '../src/game/maze.js';
import { DistanceCache } from '../src/game/paths.js';
import {
  ARENA_CORNERS,
  arenaEnemy,
  arenaMaze,
  corridorMaze,
  createTestGame,
  placePlayer,
  runForMs,
  runUntil,
  STEP_SECONDS,
} from './fixtures.js';

const ALL_KINDS = ['chaser', 'ambusher', 'patroller', 'prowler'] as const;

function arenaGame(
  overrides: Parameters<typeof createTestGame>[1] = {},
  config = DEFAULT_CONFIG,
): Game {
  const game = createTestGame(
    arenaMaze(),
    {
      selectBallSpawn: () => null,
      enemies: ALL_KINDS.map((kind) => arenaEnemy(kind)),
      ...overrides,
    },
    config,
  );
  game.startLevel();
  return game;
}

function enemyById(game: Game, id: string): Enemy {
  const enemy = game.enemies.find((candidate) => candidate.definition.id === id);
  if (!enemy) throw new Error(`no enemy ${id}`);
  return enemy;
}

function tileOf(enemy: Enemy): GridPosition {
  return { col: Math.round(enemy.actor.x), row: Math.round(enemy.actor.y) };
}

describe('enemy targeting policies', () => {
  const maze: Maze = arenaMaze();
  const distances = new DistanceCache(maze);

  function contextFor(player: { col: number; row: number; facing?: 'up' | 'down' | 'left' | 'right' }) {
    const actor = createActor({ col: player.col, row: player.row });
    actor.direction = player.facing ?? null;
    return {
      maze,
      player: actor,
      phase: 'chase' as const,
      distances,
      config: DEFAULT_CONFIG,
    };
  }

  it('aims direct pursuit at the tile the player is on', () => {
    const enemy = createEnemy(arenaEnemy('chaser'), { col: 5, row: 1 });
    const target = enemyTarget(enemy, contextFor({ col: 1, row: 6, facing: 'right' }));
    expect(target).toEqual({ col: 1, row: 6 });
  });

  it('aims the ambush four legal steps ahead, and stops at a blocked step', () => {
    const enemy = createEnemy(arenaEnemy('ambusher'), { col: 5, row: 1 });

    // Four clear steps along the bottom corridor.
    expect(enemyTarget(enemy, contextFor({ col: 1, row: 6, facing: 'right' }))).toEqual({
      col: 5,
      row: 6,
    });
    // Only two steps fit before the wall at column 10, so the target stops there.
    expect(enemyTarget(enemy, contextFor({ col: 7, row: 6, facing: 'right' }))).toEqual({
      col: 9,
      row: 6,
    });
    // A player that has never moved is targeted where it stands.
    expect(enemyTarget(enemy, contextFor({ col: 4, row: 6 }))).toEqual({ col: 4, row: 6 });
  });

  it('cycles the patrol circuit and ignores the player entirely', () => {
    const definition = arenaEnemy('patroller');
    const enemy = createEnemy(definition, { col: 5, row: 1 });
    expect(enemyTarget(enemy, contextFor({ col: 9, row: 1 }))).toEqual(ARENA_CORNERS.bottomLeft);
    enemy.waypointIndex = 1;
    expect(enemyTarget(enemy, contextFor({ col: 9, row: 1 }))).toEqual(ARENA_CORNERS.topLeft);
  });

  it('makes proximity pursuit switch between the player and its corner', () => {
    const enemy = createEnemy(arenaEnemy('prowler'), { col: 5, row: 1 });

    // Nine tiles away along the ring: far enough to pursue.
    expect(distances.between({ col: 5, row: 1 }, { col: 1, row: 6 }, 'maze')).toBeGreaterThanOrEqual(
      DEFAULT_CONFIG.prowlerPursuitTiles,
    );
    expect(enemyTarget(enemy, contextFor({ col: 1, row: 6 }))).toEqual({ col: 1, row: 6 });

    // Two tiles away: it retreats to its own corner instead.
    expect(distances.between({ col: 5, row: 1 }, { col: 3, row: 1 }, 'maze')).toBeLessThan(
      DEFAULT_CONFIG.prowlerPursuitTiles,
    );
    expect(enemyTarget(enemy, contextFor({ col: 3, row: 1 }))).toEqual(ARENA_CORNERS.bottomRight);
  });

  it('sends every kind to its own corner while scattering', () => {
    for (const kind of ALL_KINDS) {
      const definition = arenaEnemy(kind);
      const enemy = createEnemy(definition, { col: 5, row: 1 });
      const target = enemyTarget(enemy, { ...contextFor({ col: 5, row: 6 }), phase: 'scatter' });
      expect(target).toEqual(definition.scatterTarget);
    }
  });

  it('gives the four kinds four different targets from one position', () => {
    // Player two tiles to the enemies' left, walking further left. Each policy
    // reads that same situation differently, which is the point of having four.
    const context = contextFor({ col: 3, row: 1, facing: 'left' });
    const from = { col: 5, row: 1 };
    const targets = {
      chaser: enemyTarget(createEnemy(arenaEnemy('chaser'), from), context),
      ambusher: enemyTarget(createEnemy(arenaEnemy('ambusher'), from), context),
      patroller: enemyTarget(
        createEnemy(arenaEnemy('patroller', { patrolWaypoints: [ARENA_CORNERS.bottomLeft] }), from),
        context,
      ),
      prowler: enemyTarget(createEnemy(arenaEnemy('prowler'), from), context),
    };

    expect(targets.chaser).toEqual({ col: 3, row: 1 }); // Straight at the player.
    expect(targets.ambusher).toEqual({ col: 1, row: 1 }); // Ahead, stopped by the wall.
    expect(targets.patroller).toEqual(ARENA_CORNERS.bottomLeft); // Its own circuit.
    expect(targets.prowler).toEqual(ARENA_CORNERS.bottomRight); // Too close: retreats.
    expect(new Set(Object.values(targets).map(positionKey)).size).toBe(ALL_KINDS.length);
  });

  it('reads the lead tile from the player, never through a wall', () => {
    const player = createActor({ col: 1, row: 6 });
    player.direction = 'up';
    // Column 1 runs all the way up, so four steps fit.
    expect(leadTile(maze, player, 4)).toEqual({ col: 1, row: 2 });
    player.direction = 'left';
    expect(leadTile(maze, player, 4)).toEqual({ col: 1, row: 6 }); // Wall at column 0.
  });
});

describe('enemy turn decisions', () => {
  const maze = arenaMaze();
  const distances = new DistanceCache(maze);

  it('takes the legal turn that shortens the real path to the target', () => {
    // Standing at the top-left corner with the target at the bottom-left: down
    // is shorter than right, even though both are legal.
    const direction = chooseTargetedDirection(
      maze,
      { col: 1, row: 1 },
      null,
      ARENA_CORNERS.bottomLeft,
      'maze',
      distances,
    );
    expect(direction).toBe('down');
  });

  it('never reverses in a corridor, and reverses only at a dead end', () => {
    // Mid-corridor: left is the reversal and is excluded, so it keeps going.
    expect(
      chooseTargetedDirection(maze, { col: 5, row: 6 }, 'right', { col: 1, row: 6 }, 'maze', distances),
    ).toBe('right');

    // A genuine dead end leaves the reversal as the only legal exit: the
    // outermost home slot can only be left the way it was entered.
    const home = maze.home as NonNullable<Maze['home']>;
    const slot = home.spawns[0] as GridPosition;
    expect(chooseTargetedDirection(maze, slot, 'left', home.rest, 'home', distances)).toBe('right');
  });

  it('breaks ties in a fixed order, so a fixture replays exactly', () => {
    expect(TURN_ORDER).toEqual(['up', 'left', 'down', 'right']);
    // From the top-left corner the target is equidistant both ways round the
    // ring, so the earlier direction in turn order always wins.
    const first = chooseTargetedDirection(
      maze,
      { col: 5, row: 1 },
      null,
      { col: 5, row: 6 },
      'maze',
      distances,
    );
    const again = chooseTargetedDirection(
      maze,
      { col: 5, row: 1 },
      null,
      { col: 5, row: 6 },
      'maze',
      distances,
    );
    expect(first).toBe(again);
    expect(first).toBe('left');
  });

  it('keeps enemy traversal tied to each enemy state', () => {
    expect(traversalFor('roaming')).toBe('maze');
    expect(traversalFor('home')).toBe('maze');
    expect(traversalFor('exiting')).toBe('home');
    expect(traversalFor('returning')).toBe('home');
  });
});

describe('release and return lifecycle', () => {
  it('releases the four level-one enemies at 0, 2, 4 and 6 active seconds', () => {
    const game = createTestGame(createLevelOneMaze(), { selectBallSpawn: () => null });
    game.startLevel();

    expect(DEFAULT_ENEMIES.map((enemy) => enemy.releaseDelayMs)).toEqual([0, 2000, 4000, 6000]);
    const released = (): string[] =>
      game.snapshot().enemies.filter((enemy) => enemy.state !== 'home').map((enemy) => enemy.id);

    expect(released()).toEqual([]);
    runForMs(game, 100);
    expect(released()).toEqual(['chaser']);
    runForMs(game, 2000);
    expect(released()).toEqual(['chaser', 'ambusher']);
    runForMs(game, 2000);
    expect(released()).toHaveLength(3);
    runForMs(game, 2000);
    expect(released()).toHaveLength(4);
  });

  it('walks every enemy out of the home and into the maze', () => {
    const game = createTestGame(createLevelOneMaze(), { selectBallSpawn: () => null });
    game.startLevel();
    const home = game.maze.home as NonNullable<Maze['home']>;
    const homeTiles = new Set(home.tiles.map(positionKey));

    runUntil(game, () => game.enemies.every((enemy) => enemy.state === 'roaming'), 15_000);
    for (const enemy of game.enemies) {
      expect(homeTiles.has(positionKey(tileOf(enemy)))).toBe(false);
      expect(game.maze.tiles[tileOf(enemy).row]?.[tileOf(enemy).col]).not.toBe('door');
    }
  });

  it('sends an eaten enemy home, rests it for one second and puts it back in play', () => {
    const game = arenaGame();
    const chaser = enemyById(game, 'chaser');
    runUntil(game, () => chaser.state === 'roaming', 5_000);

    chaser.state = 'returning';
    chaser.reverseRequested = true;
    const home = game.maze.home as NonNullable<Maze['home']>;

    runUntil(game, () => chaser.state === 'resting', 10_000);
    expect(tileOf(chaser)).toEqual(home.rest);
    expect(chaser.waitRemainingMs).toBe(DEFAULT_CONFIG.homeWaitMs);

    // The wait is active-chase time, and it ends by leaving, not by teleporting.
    runForMs(game, 500);
    expect(chaser.state).toBe('resting');
    runForMs(game, 600);
    expect(chaser.state).toBe('exiting');

    runUntil(game, () => chaser.state === 'roaming', 10_000);
    expect(tileOf(chaser)).toEqual(home.exit);
  });

  it('holds release and return waits outside chase', () => {
    const game = createTestGame(createLevelOneMaze(), { selectBallSpawn: () => null });
    game.startLevel();
    const last = game.enemies[3] as Enemy;
    runForMs(game, 1000);
    const parked = last.waitRemainingMs;

    game.pause();
    runForMs(game, 3000);
    expect(last.waitRemainingMs).toBe(parked);
    game.resume();
    runForMs(game, 500);
    expect(last.waitRemainingMs).toBeLessThan(parked);
  });
});

describe('chase and scatter phases', () => {
  it('runs 7 seconds of scatter then 20 of chase on the level one clock', () => {
    // The enemies stay home for this one, so the phase clock is measured on its
    // own rather than through a chase that could end in a death.
    const game = arenaGame({
      enemies: [arenaEnemy('chaser', { releaseDelayMs: 10 * 60 * 1000 })],
    });
    expect(game.enemyPhase).toBe('scatter');
    expect(DEFAULT_CONFIG.scatterPhaseMs).toBe(7000);
    expect(DEFAULT_CONFIG.chasePhaseMs).toBe(20_000);

    runForMs(game, 6900);
    expect(game.enemyPhase).toBe('scatter');
    runForMs(game, 200);
    expect(game.enemyPhase).toBe('chase');

    runForMs(game, 19_800);
    expect(game.enemyPhase).toBe('chase');
    runForMs(game, 200);
    expect(game.enemyPhase).toBe('scatter');
  });

  it('turns a roaming enemy round on a phase transition', () => {
    // A short cycle so the transition happens while the enemy is still out in
    // the corridor; the reversal itself is the documented exception to the
    // no-reversal rule.
    const game = arenaGame(
      { enemies: [arenaEnemy('chaser')] },
      { ...DEFAULT_CONFIG, scatterPhaseMs: 2000, chasePhaseMs: 5000 },
    );
    const chaser = enemyById(game, 'chaser');
    runUntil(game, () => chaser.state === 'roaming', 4000);

    let before: Enemy['actor']['direction'] = null;
    for (let i = 0; i < 1200 && game.status === 'chase'; i += 1) {
      const facing = chaser.actor.direction;
      game.step(STEP_SECONDS);
      if (before === null && game.enemyPhase === 'chase') {
        before = facing;
        continue;
      }
      if (before !== null && chaser.actor.direction !== before) {
        expect(chaser.actor.direction).toBe(oppositeDirection(before));
        return;
      }
    }
    throw new Error('the enemy never changed direction after the phase flip');
  });

  it('moves enemies the same distance however the frame is sliced', () => {
    const coarse = arenaGame();
    const fine = arenaGame();
    runForMs(coarse, 3000, 1 / 30);
    runForMs(fine, 3000, 1 / 240);

    for (const [index, enemy] of coarse.enemies.entries()) {
      const other = fine.enemies[index] as Enemy;
      expect(enemy.actor.x).toBeCloseTo(other.actor.x, 6);
      expect(enemy.actor.y).toBeCloseTo(other.actor.y, 6);
      expect(enemy.state).toBe(other.state);
    }
  });

  it('runs roaming enemies at three quarters of the player speed', () => {
    const game = arenaGame({ enemies: [arenaEnemy('chaser')] });
    const chaser = enemyById(game, 'chaser');
    runUntil(game, () => chaser.state === 'roaming', 5_000);

    let travelled = 0;
    let previous = { x: chaser.actor.x, y: chaser.actor.y };
    for (let i = 0; i < 120; i += 1) {
      game.step(STEP_SECONDS);
      travelled += Math.abs(chaser.actor.x - previous.x) + Math.abs(chaser.actor.y - previous.y);
      previous = { x: chaser.actor.x, y: chaser.actor.y };
    }
    const expected =
      DEFAULT_CONFIG.playerSpeedTilesPerSecond * DEFAULT_CONFIG.enemySpeedFactor * 120 * STEP_SECONDS;
    expect(travelled).toBeCloseTo(expected, 6);
  });
});

describe('enemy configuration validation', () => {
  it('refuses more enemies than the maze has start slots', () => {
    expect(() =>
      createTestGame(arenaMaze(), {
        enemies: [...ALL_KINDS, 'chaser'].map((kind) =>
          arenaEnemy(kind as (typeof ALL_KINDS)[number]),
        ),
      }),
    ).toThrow(EnemyConfigError);
  });

  it('refuses an unreachable scatter corner or patrol waypoint', () => {
    expect(() =>
      createTestGame(arenaMaze(), {
        enemies: [arenaEnemy('chaser', { scatterTarget: { col: 0, row: 0 } })],
      }),
    ).toThrow(/scatters to an unreachable tile/);

    expect(() =>
      createTestGame(arenaMaze(), {
        enemies: [arenaEnemy('patroller', { patrolWaypoints: [{ col: 5, row: 4 }] })],
      }),
    ).toThrow(/patrols to an unreachable tile/);

    expect(() =>
      createTestGame(arenaMaze(), {
        enemies: [arenaEnemy('patroller', { patrolWaypoints: [] })],
      }),
    ).toThrow(/patrols without any waypoint/);
  });

  it('runs an empty enemy list, and a maze with no home, without enemies', () => {
    const empty = createTestGame(arenaMaze(), { enemies: [], selectBallSpawn: () => null });
    empty.startLevel();
    expect(empty.enemies).toEqual([]);
    runForMs(empty, 3000);
    expect(empty.status).toBe('chase');

    // The M1/M2 fixtures author no home at all, so they carry no enemies even
    // though the default configuration names four.
    const homeless = createTestGame(corridorMaze(), { selectBallSpawn: () => null });
    expect(homeless.maze.home).toBeNull();
    expect(homeless.enemies).toEqual([]);
  });

  it('never lets an enemy stand on the player start when the maze has no home', () => {
    const game = createTestGame(createLevelOneMaze(), { selectBallSpawn: () => null });
    placePlayer(game, game.maze.spawn);
    expect(game.enemies).toHaveLength(4);
    for (const enemy of game.enemies) {
      expect(positionKey(tileOf(enemy))).not.toBe(positionKey(game.maze.spawn));
    }
  });
});
