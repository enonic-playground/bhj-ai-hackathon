import type { EnemyKind } from '../game/config.js';
import type { Enemy } from '../game/enemy.js';
import type { Game } from '../game/game.js';
import type { Maze, Tile } from '../game/maze.js';
import { ballFillColor, frightenedTone, pelletRadiusFactor, protectionAlpha } from './motion.js';

const COLORS = {
  background: '#05060f',
  wallFill: '#141f63',
  wallStroke: '#4664ee',
  homeFill: '#241645',
  homeStroke: '#6b4fb0',
  door: '#ff9ad5',
  dot: '#f3e3c3',
  pellet: '#ffe9a8',
  fruit: '#ff6b4a',
  fruitStem: '#7be07a',
  player: '#ffd23f',
  shield: '#7cf6ff',
  ballRing: '#ffffff',
  frightened: '#3355ff',
  frightenedFlash: '#e8f0ff',
  eyes: '#ffffff',
  pupils: '#101636',
  mark: '#f4f7ff',
  markEdge: '#0b0f24',
  freeze: 'rgba(5, 6, 15, 0.62)',
};

/**
 * One colour and one shape per enemy. The mark is what makes an enemy
 * identifiable when every body turns blue during a frightened effect, and it is
 * a shape rather than only a hue so the four are told apart without colour.
 */
const ENEMY_STYLES: Record<EnemyKind, { readonly color: string; readonly mark: MarkShape }> = {
  chaser: { color: '#ff5c57', mark: 'circle' },
  ambusher: { color: '#ff8ad8', mark: 'triangle' },
  patroller: { color: '#57d9ff', mark: 'square' },
  prowler: { color: '#ffb357', mark: 'diamond' },
};

type MarkShape = 'circle' | 'triangle' | 'square' | 'diamond';

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

/** Draws the maze, the collectibles and every actor. Owns no game state. */
export class MazeRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #context: CanvasRenderingContext2D;
  readonly #maze: Maze;
  #tileSize = 0;
  #reducedMotion = false;

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
   * Applies the system `prefers-reduced-motion` preference to canvas effects
   * (AC3): the ball fill, pellet pulse, frightened-expiry flash and
   * protection ring all switch to a stable presentation. Essential actor
   * movement, chomp animation and one-time transition effects (death,
   * capture) are unaffected — only continuously looping decoration changes.
   */
  setReducedMotion(reducedMotion: boolean): void {
    this.#reducedMotion = reducedMotion;
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
    this.#drawPowerPellets(game, timeMs);
    this.#drawFruit(game);
    this.#drawBall(game, timeMs);
    this.#drawEnemies(game, timeMs);
    this.#drawPlayer(game, timeMs);
    if (game.isFrozen) {
      // The maze stays readable behind a panel or an overlay, but visibly paused.
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

  /**
   * Pellets pulse, so they read as the powerful pick-up rather than a big
   * dot; reduced motion holds a steady mid-cycle size instead (AC3).
   */
  #drawPowerPellets(game: Game, timeMs: number): void {
    const ctx = this.#context;
    const tile = this.#tileSize;
    const pulse = pelletRadiusFactor(timeMs, this.#reducedMotion);
    ctx.fillStyle = COLORS.pellet;
    for (const pellet of game.remainingPowerPellets()) {
      ctx.beginPath();
      ctx.arc(
        (pellet.col + 0.5) * tile,
        (pellet.row + 0.5) * tile,
        Math.max(2, tile * pulse),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  /**
   * The fruit is a distinct rounded shape with a small stem, so it reads as a
   * different kind of pick-up from the round dots and pulsing pellets rather
   * than only by colour.
   */
  #drawFruit(game: Game): void {
    const fruit = game.fruit;
    if (!fruit) {
      return;
    }
    const ctx = this.#context;
    const tile = this.#tileSize;
    const centreX = (fruit.position.col + 0.5) * tile;
    const centreY = (fruit.position.row + 0.5) * tile;
    const radius = tile * 0.32;

    ctx.fillStyle = COLORS.fruit;
    ctx.beginPath();
    ctx.arc(centreX, centreY + radius * 0.12, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = COLORS.fruitStem;
    ctx.lineWidth = Math.max(1, tile * 0.08);
    ctx.beginPath();
    ctx.moveTo(centreX, centreY - radius * 0.7);
    ctx.lineTo(centreX + radius * 0.35, centreY - radius * 1.35);
    ctx.stroke();
  }

  /**
   * The target is a ringed disc whose fill sweeps through the whole hue circle
   * every two active seconds, so it stays findable on a busy maze. The white
   * ring is what keeps it unmistakable at the hues closest to the dots, the
   * player and the enemies.
   */
  #drawBall(game: Game, timeMs: number): void {
    const ball = game.ball;
    if (!ball) {
      return;
    }
    // One colour for the whole frame, handed to both seam copies, so the two
    // halves of a ball crossing the tunnel can never be a cycle apart. In
    // reduced motion this is a stable colour rather than the D015 hue cycle.
    const fill = ballFillColor(timeMs, this.#reducedMotion);
    this.#atSeam(ball.x, (x) => this.#drawBallAt(x, ball.y, fill));
  }

  #drawBallAt(x: number, y: number, fill: string): void {
    const ctx = this.#context;
    const tile = this.#tileSize;
    const centreX = (x + 0.5) * tile;
    const centreY = (y + 0.5) * tile;
    const radius = tile * 0.3;

    ctx.fillStyle = fill;
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

  #drawEnemies(game: Game, timeMs: number): void {
    const frightenedMs = game.frightenedRemainingMs;
    for (const enemy of game.enemies) {
      this.#atSeam(enemy.actor.x, (x) => this.#drawEnemyAt(enemy, x, frightenedMs, timeMs));
    }
  }

  #drawEnemyAt(enemy: Enemy, x: number, frightenedMs: number, timeMs: number): void {
    const ctx = this.#context;
    const tile = this.#tileSize;
    const centreX = (x + 0.5) * tile;
    const centreY = (enemy.actor.y + 0.5) * tile;
    const radius = tile * 0.4;
    const style = ENEMY_STYLES[enemy.definition.kind];
    const edible = enemy.state === 'roaming' && frightenedMs > 0;
    // An eaten enemy is a pair of eyes: it is on its way home and harmless.
    const bodiless = enemy.state === 'returning';

    if (!bodiless) {
      ctx.fillStyle = edible ? this.#frightenedColor(frightenedMs, timeMs) : style.color;
      this.#traceBody(centreX, centreY, radius);
      ctx.fill();
      this.#drawMark(centreX, centreY, radius, style.mark);
    }
    this.#drawEyes(centreX, centreY, radius, enemy.actor.direction, edible);
  }

  /**
   * Flashing warns that the effect is about to end, without relying on
   * colour alone: the body also alternates between two clearly different
   * tones. Reduced motion holds the warning tone steady instead of blinking
   * it (AC3), keeping the nonflashing cue that the effect is about to end.
   */
  #frightenedColor(frightenedMs: number, timeMs: number): string {
    const tone = frightenedTone(frightenedMs, timeMs, this.#reducedMotion);
    return tone === 'flash' ? COLORS.frightenedFlash : COLORS.frightened;
  }

  /** Dome on top, three feet along the bottom: the arcade silhouette. */
  #traceBody(centreX: number, centreY: number, radius: number): void {
    const ctx = this.#context;
    const bottom = centreY + radius;
    ctx.beginPath();
    ctx.arc(centreX, centreY, radius, Math.PI, 0);
    ctx.lineTo(centreX + radius, bottom);
    for (let foot = 0; foot < 3; foot += 1) {
      const from = centreX + radius - (foot * radius * 2) / 3;
      const to = from - (radius * 2) / 3;
      ctx.quadraticCurveTo((from + to) / 2, bottom - radius * 0.35, to, bottom);
    }
    ctx.closePath();
  }

  /** The per-enemy shape, so identity survives the frightened colour change. */
  #drawMark(centreX: number, centreY: number, radius: number, shape: MarkShape): void {
    const ctx = this.#context;
    const size = radius * 0.42;
    const y = centreY + radius * 0.38;
    // A pale mark inside a dark outline, so the shape reads on a coloured body,
    // on the frightened blue, and on the pale flash that warns the effect is
    // about to end. The shape is the identity; the colour only reinforces it.
    ctx.fillStyle = COLORS.mark;
    ctx.strokeStyle = COLORS.markEdge;
    ctx.lineWidth = Math.max(1, radius * 0.16);
    ctx.beginPath();
    switch (shape) {
      case 'circle':
        ctx.arc(centreX, y, size, 0, Math.PI * 2);
        break;
      case 'triangle':
        ctx.moveTo(centreX, y - size);
        ctx.lineTo(centreX + size, y + size);
        ctx.lineTo(centreX - size, y + size);
        break;
      case 'square':
        ctx.rect(centreX - size, y - size, size * 2, size * 2);
        break;
      case 'diamond':
        ctx.moveTo(centreX, y - size * 1.2);
        ctx.lineTo(centreX + size, y);
        ctx.lineTo(centreX, y + size * 1.2);
        ctx.lineTo(centreX - size, y);
        break;
      default:
        break;
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
  }

  #drawEyes(
    centreX: number,
    centreY: number,
    radius: number,
    direction: string | null,
    edible: boolean,
  ): void {
    const ctx = this.#context;
    const offsetX = radius * 0.34;
    const eyeY = centreY - radius * 0.18;
    const eyeRadius = radius * 0.28;
    const look = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction ?? 'left'] ?? [
      -1, 0,
    ];

    for (const side of [-1, 1]) {
      ctx.fillStyle = COLORS.eyes;
      ctx.beginPath();
      ctx.arc(centreX + side * offsetX, eyeY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      if (edible) continue; // Frightened eyes stay blank, as in the arcade.
      ctx.fillStyle = COLORS.pupils;
      ctx.beginPath();
      ctx.arc(
        centreX + side * offsetX + (look[0] ?? 0) * eyeRadius * 0.4,
        eyeY + (look[1] ?? 0) * eyeRadius * 0.4,
        eyeRadius * 0.5,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  #drawPlayer(game: Game, timeMs: number): void {
    const { x, y, direction } = game.player;
    // Near the tunnel seam the player is drawn on both sides of the maze.
    this.#atSeam(x, (seamX) => this.#drawPlayerAt(game, seamX, y, direction, timeMs));
  }

  #drawPlayerAt(
    game: Game,
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

    if (game.dyingRemainingMs > 0) {
      // The death presentation: a ring expands away from the player while the
      // maze is frozen, so the moment reads even without the overlay text.
      const progress = 1 - game.dyingRemainingMs / game.config.dyingPresentationMs;
      ctx.strokeStyle = COLORS.player;
      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.lineWidth = Math.max(1, tile * 0.1);
      ctx.beginPath();
      ctx.arc(centreX, centreY, radius * (1 + progress * 1.6), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (game.protectionRemainingMs > 0) {
      // Protection: a pulsing ring, drawn whether or not the player is
      // moving; reduced motion holds a steady, clearly visible alpha (AC3).
      ctx.strokeStyle = COLORS.shield;
      ctx.lineWidth = Math.max(1, tile * 0.09);
      ctx.globalAlpha = protectionAlpha(timeMs, this.#reducedMotion);
      ctx.beginPath();
      ctx.arc(centreX, centreY, radius * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = COLORS.player;
    ctx.beginPath();
    ctx.moveTo(centreX, centreY);
    ctx.arc(centreX, centreY, radius, facing + mouth, facing - mouth);
    ctx.closePath();
    ctx.fill();
  }
}
