import { describe, expect, it } from 'vitest';
import { actorTile, createActor } from '../src/game/actor.js';
import {
  actorSeparation,
  advanceBall,
  chooseBallDirection,
  isCaptured,
  legalExits,
} from '../src/game/ball.js';
import { DEFAULT_CONFIG } from '../src/game/config.js';
import { createMaze, isPlayerWalkable, tileAt } from '../src/game/maze.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { createSeededRandom } from '../src/game/random.js';
import {
  ballAt,
  corridorMaze,
  createTestGame,
  ringMaze,
  runForMs,
  runUntil,
  STEP_SECONDS,
} from './fixtures.js';

const CAPTURE_RADIUS = DEFAULT_CONFIG.captureRadiusTiles;

/** Long straight run, for speed measurements. */
const LONG_CORRIDOR = ['############', '#P.........#', '############'];

/** A corridor that closes into a ring through the side tunnel. */
const SEAM_CORRIDOR = ['##########', 'TP.......T', '##########'];

describe('ball direction policy', () => {
  it('rolls straight on through a corridor rather than reversing', () => {
    const maze = createMaze(LONG_CORRIDOR);
    const random = createSeededRandom(5);
    for (let col = 2; col <= 9; col += 1) {
      expect(chooseBallDirection(maze, { col, row: 1 }, 'right', random)).toBe('right');
    }
  });

  it('reverses at a dead end instead of stopping', () => {
    const maze = createMaze(LONG_CORRIDOR);
    const random = createSeededRandom(5);
    expect(legalExits(maze, { col: 10, row: 1 })).toEqual(['left']);
    expect(chooseBallDirection(maze, { col: 10, row: 1 }, 'right', random)).toBe('left');
  });

  it('chooses among the junction exits without turning back', () => {
    const maze = createLevelOneMaze();
    const junction = { col: 5, row: 4 }; // Open on all four sides.
    expect(legalExits(maze, junction).sort()).toEqual(['down', 'left', 'right', 'up']);

    const random = createSeededRandom(11);
    const seen = new Set<string>();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const chosen = chooseBallDirection(maze, junction, 'right', random);
      expect(chosen).not.toBe('left'); // The way it came.
      seen.add(chosen as string);
    }
    expect([...seen].sort()).toEqual(['down', 'right', 'up']);
  });

  it('turns back only when a dead end leaves no other exit', () => {
    const maze = ringMaze();
    const random = createSeededRandom(11);
    // A corner is not a dead end: it has one exit that is not a reversal.
    expect(chooseBallDirection(maze, { col: 1, row: 1 }, 'up', random)).toBe('right');
  });

  it('never leaves the corridors, the tunnels or the maze', () => {
    const maze = createLevelOneMaze();
    const ball = createActor(maze.spawn);
    const random = createSeededRandom(99);

    for (let step = 0; step < 4000; step += 1) {
      advanceBall(maze, ball, 0.05, random);
      expect(ball.x).toBeGreaterThanOrEqual(0);
      expect(ball.x).toBeLessThan(maze.width);
      const tile = actorTile(maze, ball);
      expect(isPlayerWalkable(tileAt(maze, tile.col, tile.row))).toBe(true);
    }
  });

  it('uses the side tunnel', () => {
    const maze = createLevelOneMaze();
    const tunnelRow = maze.tunnelRows[0] as number;
    const ball = { ...createActor({ col: 1, row: tunnelRow }), direction: 'left' as const };
    const random = createSeededRandom(4);
    advanceBall(maze, ball, 1.5, random);
    expect(ball.x).toBeGreaterThan(maze.width - 2); // Crossed the seam.
    expect(ball.y).toBe(tunnelRow);
  });
});

describe('ball speed', () => {
  it('travels at 80 per cent of the player speed', () => {
    const maze = createMaze(LONG_CORRIDOR);
    const ball = createActor({ col: 1, row: 1 });
    const random = createSeededRandom(1);
    const distance = DEFAULT_CONFIG.playerSpeedTilesPerSecond * DEFAULT_CONFIG.ballSpeedFactor;

    advanceBall(maze, ball, distance, random); // One second of ball travel.
    expect(ball.x).toBeCloseTo(1 + 4.8, 9);
    expect(DEFAULT_CONFIG.ballSpeedFactor).toBeLessThan(1);
  });

  it('moves the ball four tiles for every five the player moves', () => {
    // One straight corridor, so both actors travel along the same axis and
    // neither reaches the other within the measured half second.
    const game = createTestGame(createMaze(LONG_CORRIDOR), {
      selectBallSpawn: ballAt({ col: 10, row: 1 }),
    });
    game.startLevel();
    game.requestDirection('right');
    const start = game.snapshot();
    runForMs(game, 500);
    const end = game.snapshot();

    const playerMoved = Math.abs(end.player.x - start.player.x);
    const ballMoved = Math.abs((end.ball?.x ?? 0) - (start.ball?.x ?? 0));
    expect(end.status).toBe('chase');
    expect(playerMoved).toBeCloseTo(3, 6);
    expect(ballMoved).toBeCloseTo(playerMoved * DEFAULT_CONFIG.ballSpeedFactor, 6);
  });
});

describe('ball and collectibles', () => {
  it('collects no dots as it rolls over them', () => {
    const maze = createLevelOneMaze();
    const game = createTestGame(maze, { selectBallSpawn: ballAt({ col: 1, row: 1 }) });
    game.startLevel();
    const dots = game.dotsRemaining;

    // The player never moves, so any dot lost would be the ball's doing.
    for (let step = 0; step < 600 && game.status === 'chase'; step += 1) {
      game.step(STEP_SECONDS);
      expect(game.dotsRemaining).toBe(dots);
      expect(game.score).toBe(0);
    }
  });
});

describe('contact measurement', () => {
  it('is the straight distance along a shared corridor', () => {
    const maze = corridorMaze();
    const player = createActor({ col: 1, row: 1 });
    const ball = createActor({ col: 3, row: 1 });
    expect(actorSeparation(maze, player, ball)).toBeCloseTo(2, 9);
    expect(isCaptured(maze, player, ball, CAPTURE_RADIUS)).toBe(false);

    ball.x = 1.5;
    expect(isCaptured(maze, player, ball, CAPTURE_RADIUS)).toBe(true);
    ball.x = 1.51;
    expect(isCaptured(maze, player, ball, CAPTURE_RADIUS)).toBe(false);
  });

  it('measures the seam only on a tunnel row', () => {
    const maze = createLevelOneMaze();
    const tunnelRow = maze.tunnelRows[0] as number;

    const player = { ...createActor({ col: 0, row: tunnelRow }), x: 0.1 };
    const ball = { ...createActor({ col: 20, row: tunnelRow }), x: 20.8 };
    expect(actorSeparation(maze, player, ball)).toBeCloseTo(0.3, 9);
    expect(isCaptured(maze, player, ball, CAPTURE_RADIUS)).toBe(true);

    // Same columns on an ordinary row are at opposite ends of the maze, with
    // walls in between: they must not read as adjacent.
    const farPlayer = { ...createActor({ col: 1, row: 1 }), x: 1 };
    const farBall = { ...createActor({ col: 19, row: 1 }), x: 19 };
    expect(actorSeparation(maze, farPlayer, farBall)).toBeCloseTo(18, 9);
    expect(isCaptured(maze, farPlayer, farBall, CAPTURE_RADIUS)).toBe(false);
  });

  it('keeps actors in separate corridors apart', () => {
    const maze = ringMaze(); // Columns 1 and 7 are separated by a wall block.
    const player = createActor({ col: 1, row: 3 });
    const ball = createActor({ col: 7, row: 3 });
    expect(isCaptured(maze, player, ball, CAPTURE_RADIUS)).toBe(false);
    expect(actorSeparation(maze, player, ball)).toBeCloseTo(6, 9);
  });
});

describe('capture during movement', () => {
  it('catches a ball travelling the other way', () => {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    game.startLevel();
    game.requestDirection('right');
    expect(game.ball).not.toBeNull();

    runForMs(game, 1000);
    expect(game.status).toBe('guess');
    expect(game.ball).toBeNull();
  });

  it('cannot be passed through by one very long step', () => {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    game.startLevel();
    game.requestDirection('right');

    game.step(10); // A ten-second frame: sixty tiles of player travel.
    expect(game.status).toBe('guess');
    expect(game.player.x).toBeLessThanOrEqual(5);
    expect(game.player.x).toBeGreaterThan(1);
  });

  it('catches a ball that meets the player across the tunnel seam', () => {
    const maze = createMaze(SEAM_CORRIDOR);
    const game = createTestGame(maze, { selectBallSpawn: ballAt({ col: 9, row: 1 }) });
    game.startLevel();

    // The ball heads into the seam; the no-reversal rule keeps it going that
    // way, so it crosses from column 9 to column 0 while the player walks the
    // other way into the same seam. They meet with the maze edge between them.
    (game.ball as { direction: 'right' }).direction = 'right';
    game.requestDirection('left');

    runUntil(game, () => game.status === 'guess', 2000);
    expect(game.status).toBe('guess');
    const { x } = game.snapshot().player;
    expect(Math.min(x, maze.width - x)).toBeLessThan(1.5); // Caught at the seam.
  });

  it('enters guessing once and then ignores further steps', () => {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    game.startLevel();
    game.requestDirection('right');
    runForMs(game, 1000);

    const captured = game.snapshot();
    expect(captured.status).toBe('guess');
    runForMs(game, 5000);
    expect(game.snapshot()).toEqual(captured);
  });

  it('awards the dots reached before the capture', () => {
    const game = createTestGame(corridorMaze(), { selectBallSpawn: ballAt({ col: 5, row: 1 }) });
    game.startLevel();
    game.requestDirection('right');
    runForMs(game, 1000);

    expect(game.status).toBe('guess');
    expect(game.score).toBeGreaterThan(0);
    expect(game.score % DEFAULT_CONFIG.dotScore).toBe(0);
    expect(game.dotsRemaining).toBeLessThan(game.maze.dotTiles.length);
  });
});
