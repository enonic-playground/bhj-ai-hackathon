import type { Game } from '../game/game.js';
import type { Maze, Tile } from '../game/maze.js';

const COLORS = {
  background: '#05060f',
  wallFill: '#141f63',
  wallStroke: '#4664ee',
  homeFill: '#241645',
  homeStroke: '#6b4fb0',
  door: '#ff9ad5',
  dot: '#f3e3c3',
  player: '#ffd23f',
  ball: '#3ef0d8',
  ballRing: '#ffffff',
  freeze: 'rgba(5, 6, 15, 0.62)',
};

type SolidGroup = 'wall' | 'home';

/** Solid tiles grouped by appearance; corridors return null. */
function solidGroup(tile: Tile): SolidGroup | null {
  switch (tile) {
    case 'wall':
      return 'wall';
    case 'home':
    case 'door':
      return 'home';
    default:
      return null;
  }
}

/** Draws the maze and player. Owns no game state. */
export class MazeRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #maze: Maze;
  #tileSize = 0;

  constructor(canvas: HTMLCanvasElement, maze: Maze) {
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas 2D context is unavailable');
    }
    this.#canvas = canvas;
    this.#context = context;
    this.#maze = maze;
  }

  get tileSize(): number {
    return this.#tileSize;
  }

  /**
   * Fits the maze inside `available` CSS pixels using an integer tile size, so
   * tiles stay square at every viewport.
   */
  resize(availableWidth: number, availableHeight: number, devicePixelRatio = 1): void {
    const scale = Math.min(availableWidth / this.#maze.width, availableHeight / this.#maze.height);
    const tileSize = Math.max(4, Math.floor(scale));
    const cssWidth = tileSize * this.#maze.width;
    const cssHeight = tileSize * this.#maze.height;

    this.#tileSize = tileSize;
    this.#canvas.style.width = `${cssWidth}px`;
    this.#canvas.style.height = `${cssHeight}px`;
    this.#canvas.width = Math.round(cssWidth * devicePixelRatio);
    this.#canvas.height = Math.round(cssHeight * devicePixelRatio);
    this.#context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  /**
   * Draws the current game. Animation is driven by the game's own active time,
   * so a frozen maze is genuinely still and a slow or delayed frame cannot
   * advance anything.
   */
  draw(game: Game): void {
    const tile = this.#tileSize;
    if (tile <= 0) {
      return;
    }
    const ctx = this.#context;
    const timeMs = game.activeTimeMs;
    ctx.save();
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, this.#maze.width * tile, this.#maze.height * tile);

    this.#drawWalls();
    this.#drawDots(game);
    this.#drawBall(game);
    this.#drawPlayer(game, timeMs);
    if (game.isFrozen) {
      // The maze stays readable behind the guessing panel, but visibly paused.
      ctx.fillStyle = COLORS.freeze;
      ctx.fillRect(0, 0, this.#maze.width * tile, this.#maze.height * tile);
    }
    ctx.restore();
  }

  /**
   * Solid tiles are filled edge to edge and outlined only where they meet a
   * corridor or a different structure, so walls read as connected barriers.
   */
  #drawWalls(): void {
    const ctx = this.#context;
    const tile = this.#tileSize;
    const lineWidth = Math.max(1, Math.round(tile * 0.08));
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';

    for (let row = 0; row < this.#maze.height; row += 1) {
      for (let col = 0; col < this.#maze.width; col += 1) {
        const group = solidGroup(this.#maze.tiles[row]?.[col] ?? 'wall');
        if (!group) continue;

        const x = col * tile;
        const y = row * tile;
        ctx.fillStyle = group === 'home' ? COLORS.homeFill : COLORS.wallFill;
        ctx.fillRect(x, y, tile, tile);

        ctx.strokeStyle = group === 'home' ? COLORS.homeStroke : COLORS.wallStroke;
        ctx.beginPath();
        const inset = lineWidth / 2;
        if (this.#groupAt(col, row - 1) !== group) {
          ctx.moveTo(x, y + inset);
          ctx.lineTo(x + tile, y + inset);
        }
        if (this.#groupAt(col, row + 1) !== group) {
          ctx.moveTo(x, y + tile - inset);
          ctx.lineTo(x + tile, y + tile - inset);
        }
        if (this.#groupAt(col - 1, row) !== group) {
          ctx.moveTo(x + inset, y);
          ctx.lineTo(x + inset, y + tile);
        }
        if (this.#groupAt(col + 1, row) !== group) {
          ctx.moveTo(x + tile - inset, y);
          ctx.lineTo(x + tile - inset, y + tile);
        }
        ctx.stroke();
      }
    }

    // The enemy home door, drawn over its tile so the gate stays recognisable.
    for (let row = 0; row < this.#maze.height; row += 1) {
      for (let col = 0; col < this.#maze.width; col += 1) {
        if ((this.#maze.tiles[row]?.[col] ?? 'wall') !== 'door') continue;
        ctx.fillStyle = COLORS.door;
        ctx.fillRect(col * tile, (row + 0.4) * tile, tile, tile * 0.2);
      }
    }
  }

  #groupAt(col: number, row: number): SolidGroup | 'outside' | null {
    if (row < 0 || row >= this.#maze.height || col < 0 || col >= this.#maze.width) {
      return 'outside';
    }
    return solidGroup(this.#maze.tiles[row]?.[col] ?? 'wall');
  }

  #drawDots(game: Game): void {
    const ctx = this.#context;
    const tile = this.#tileSize;
    ctx.fillStyle = COLORS.dot;
    for (const dot of game.remainingDots()) {
      ctx.beginPath();
      ctx.arc((dot.col + 0.5) * tile, (dot.row + 0.5) * tile, Math.max(1, tile * 0.11), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** The target is a ringed disc, unmistakable against the player and dots. */
  #drawBall(game: Game): void {
    const ball = game.ball;
    if (!ball) {
      return;
    }
    this.#atSeam(ball.x, (x) => this.#drawBallAt(x, ball.y));
  }

  #drawBallAt(x: number, y: number): void {
    const ctx = this.#context;
    const tile = this.#tileSize;
    const centreX = (x + 0.5) * tile;
    const centreY = (y + 0.5) * tile;
    const radius = tile * 0.3;

    ctx.fillStyle = COLORS.ball;
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.ballRing;
    ctx.lineWidth = Math.max(1, tile * 0.07);
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius * 1.45, 0, Math.PI * 2);
    ctx.stroke();
  }

  /** Runs `draw` at `x`, and again across the seam when the actor is near it. */
  #atSeam(x: number, draw: (x: number) => void): void {
    draw(x);
    if (x > this.#maze.width - 1) {
      draw(x - this.#maze.width);
    } else if (x < 1) {
      draw(x + this.#maze.width);
    }
  }

  #drawPlayer(game: Game, timeMs: number): void {
    const { x, y, direction } = game.player;
    // Near the tunnel seam the player is drawn on both sides of the maze.
    this.#atSeam(x, (seamX) => this.#drawPlayerAt(seamX, y, direction, timeMs));
  }

  #drawPlayerAt(
    x: number,
    y: number,
    direction: string | null,
    timeMs: number,
  ): void {
    const ctx = this.#context;
    const tile = this.#tileSize;
    const centreX = (x + 0.5) * tile;
    const centreY = (y + 0.5) * tile;
    const radius = tile * 0.42;

    const facing = { up: -Math.PI / 2, down: Math.PI / 2, left: Math.PI, right: 0 }[
      direction ?? 'right'
    ] ?? 0;
    const openness = direction === null ? 0.18 : 0.05 + 0.25 * (1 + Math.sin(timeMs / 60)) * 0.5;
    const mouth = openness * Math.PI;

    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(centreX, centreY);
    ctx.arc(centreX, centreY, radius, facing + mouth, facing - mouth);
    ctx.closePath();
    ctx.fill();
  }
}
