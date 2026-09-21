import { writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { BALL_HUE_CYCLE_MS } from '../src/render/motion.js';
import { CALM_FIXTURE, chaseUntilCaught, snapshot } from './support.js';

/**
 * AC11: the ball's fill sweeps the whole hue circle once every two active
 * seconds. These journeys read the pixels the renderer actually produced,
 * rather than the colour it was asked for, so they cover the drawing as well as
 * the arithmetic. The enemies are off: this is about the ball, and a death
 * would only add noise.
 */

declare global {
  interface Window {
    /** Reads the canvas where the ball was last drawn; see `sampleBall`. */
    __sampleBall?: (offsetTiles: number) => { r: number; g: number; b: number; a: number } | null;
  }
}

const MAZE = createLevelOneMaze();
/** The left tunnel endpoint of the authored maze; the ball starts here. */
const TUNNEL_SPAWN = { col: 0, row: 10 };
const SEAM_FIXTURE = `/?testWord=0&testSeed=7&testEnemies=off&testBall=${TUNNEL_SPAWN.col},${TUNNEL_SPAWN.row}`;

interface Pixel {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/**
 * Installs a reader that takes the ball's drawn colour straight off the canvas.
 *
 * The snapshot and the pixels are read in the same synchronous block, so the
 * position used is the one the ball has at that instant; `offsetTiles` shifts
 * the sample point along the row, which is how the two halves of a ball
 * straddling the tunnel seam are both reached.
 *
 * A small patch is read rather than a single pixel, and the most saturated one
 * is returned. The ball is a disc a few pixels across, drawn with antialiasing
 * and at a device pixel ratio that need not divide the maze evenly, so one
 * chosen pixel can land on a partly covered edge. The brightest pixel of the
 * patch is the fill itself, which is what these journeys are about.
 */
async function installSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.__sampleBall = (offsetTiles: number) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#maze-canvas');
      const state = window.__hacman?.getSnapshot();
      if (!canvas || !state?.ball) return null;

      const context = canvas.getContext('2d');
      if (!context) return null;
      const ratio = canvas.width / Number.parseFloat(canvas.style.width || '0');
      const tile = canvas.width / 21 / ratio;
      const centreX = (state.ball.x + 0.5 + offsetTiles) * tile * ratio;
      const centreY = (state.ball.y + 0.5) * tile * ratio;

      let best: { r: number; g: number; b: number; a: number } | null = null;
      for (const stepX of [0, -1, 1, -2, 2]) {
        for (const stepY of [0, -1, 1, -2, 2]) {
          const x = Math.round(centreX) + stepX;
          const y = Math.round(centreY) + stepY;
          if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;
          const [r, g, b, a] = context.getImageData(x, y, 1, 1).data;
          // A resize clears the canvas, so a pixel read between that and the
          // next frame is transparent rather than drawn. Those are skipped.
          if (a !== 255) continue;
          const pixel = { r: r ?? 0, g: g ?? 0, b: b ?? 0, a };
          const brightness = Math.max(pixel.r, pixel.g, pixel.b);
          if (!best || brightness > Math.max(best.r, best.g, best.b)) {
            best = pixel;
          }
        }
      }
      return best;
    };
  });
}

async function sampleBall(page: Page, offsetTiles = 0): Promise<Pixel> {
  // The canvas can be momentarily blank straight after a resize, so a read that
  // finds nothing drawn waits for the next frame rather than failing.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const pixel = await page.evaluate(
      (offset) => window.__sampleBall?.(offset) ?? null,
      offsetTiles,
    );
    if (pixel) return pixel;
    await page.waitForTimeout(50);
  }
  throw new Error('the ball could not be sampled');
}

function distance(a: Pixel, b: Pixel): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

/** Bright and saturated: what the ball looks like while the maze is running. */
function expectBallFill(pixel: Pixel): void {
  expect(pixel.a).toBe(255);
  expect(Math.max(pixel.r, pixel.g, pixel.b)).toBeGreaterThan(180);
  expect(Math.min(pixel.r, pixel.g, pixel.b)).toBeLessThan(140);
}

/**
 * The same fill seen through the dim overlay a frozen maze is drawn under.
 * Every frozen sample is darkened by the same amount, so frozen samples are
 * only ever compared with other frozen ones.
 */
function expectFrozenBallFill(pixel: Pixel): void {
  expect(pixel.a).toBe(255);
  expect(Math.max(pixel.r, pixel.g, pixel.b)).toBeGreaterThan(60);
  expect(Math.min(pixel.r, pixel.g, pixel.b)).toBeLessThan(70);
}

/**
 * Saves what the renderer actually drew, rather than a screenshot of the page.
 * The seam evidence is taken with the maze frozen, and a page screenshot would
 * be mostly pause overlay; the canvas itself shows the two halves of the ball.
 */
async function saveCanvas(page: Page, path: string): Promise<void> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#maze-canvas');
    return canvas?.toDataURL('image/png') ?? null;
  });
  if (!dataUrl) throw new Error('the maze canvas could not be read');
  writeFileSync(path, Buffer.from(dataUrl.split(',')[1] ?? '', 'base64'));
}

/** Waits for a frame to be drawn in the state the page has just entered. */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(150);
}

/**
 * Plays on until the maze's own clock has advanced by `ms`.
 *
 * The hue is a function of active maze time, not of the wall clock, so every
 * measurement here is taken against that clock. It also keeps the checks honest
 * on a loaded machine, where frames arrive late and a wall-clock wait would
 * cover far less of the cycle than it looks like it does.
 */
async function advanceActiveTime(page: Page, ms: number): Promise<void> {
  const from = (await snapshot(page)).activeTimeMs;
  await expect
    .poll(async () => (await snapshot(page)).activeTimeMs, { timeout: 30_000, intervals: [10] })
    .toBeGreaterThanOrEqual(from + ms);
}

/** The drawn copies are one maze width apart, so this is where both are visible. */
const SEAM_TARGET_X = MAZE.width - 0.5;

async function pause(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
}

async function resume(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
}

/**
 * Steps the round forward, with the real pause control, until the ball is
 * parked straddling the tunnel seam.
 *
 * Both drawn copies are only on the canvas together for about a quarter of a
 * tile, which the ball crosses in roughly fifty milliseconds. Rather than hope
 * to catch that by polling, each attempt reads where the ball actually is and
 * plays for exactly as long as it needs to reach the middle of that window. A
 * turn at a junction simply means the next attempt tries again.
 */
async function startSeamRound(page: Page): Promise<void> {
  await page.goto(SEAM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  const ball = (await snapshot(page)).ball;
  expect(ball?.y).toBe(TUNNEL_SPAWN.row);
}

async function parkBallOnSeam(page: Page): Promise<void> {
  // Both drawn copies are on the canvas together only while the ball is within
  // about a quarter of a tile of the seam, which it crosses in a few frames.
  // The journey watches the ball's own position and stops the clock as it
  // approaches. Pinning the spawn to the tunnel endpoint means a fresh round
  // always produces another crossing straight away, so a pause that lands late
  // is retried from the start rather than waited out.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const deadline = Date.now() + 8_000;

    while (Date.now() < deadline) {
      const ball = (await snapshot(page)).ball;
      if (!ball) throw new Error('the fixture must place a ball');

      // Triggered a little early, because pausing takes a moment during which
      // the ball keeps rolling.
      if (ball.x > SEAM_TARGET_X - 0.35 && ball.x < SEAM_TARGET_X) {
        await pause(page);
        const parked = (await snapshot(page)).ball;
        if (parked && Math.abs(parked.x - SEAM_TARGET_X) < 0.2) {
          return;
        }
        break;
      }
    }
    await startSeamRound(page);
  }
  throw new Error('the ball never parked on the tunnel seam');
}

test.beforeEach(async ({ page }) => {
  await installSampler(page);
});

test('the ball sweeps through the spectrum as the maze runs', async ({ page }, testInfo) => {
  await page.goto(CALM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  // Eight samples spread across one whole cycle of active maze time, with the
  // maze itself captured at four of them so the sweep can be seen as well as
  // measured.
  const samples: Pixel[] = [];
  for (let step = 0; step < 8; step += 1) {
    samples.push(await sampleBall(page));
    if (step % 2 === 0) {
      await saveCanvas(
        page,
        `docs/evidence/m3/${testInfo.project.name}-ball-cycle-${step / 2 + 1}.png`,
      );
    }
    await advanceActiveTime(page, BALL_HUE_CYCLE_MS / 8);
  }

  for (const pixel of samples) {
    expectBallFill(pixel);
  }
  // It really travels the spectrum rather than sitting on one colour.
  const furthest = Math.max(...samples.map((pixel) => distance(samples[0] as Pixel, pixel)));
  expect(furthest).toBeGreaterThan(80);

  // And it is a cycle: one whole revolution later the colour is back where it
  // started, which neither a one-way drift nor a random flicker would be.
  const before = await sampleBall(page);
  await advanceActiveTime(page, BALL_HUE_CYCLE_MS);
  expect(distance(before, await sampleBall(page))).toBeLessThan(40);

});

test('the colour freezes with the maze and resumes without jumping ahead', async ({ page }) => {
  await page.goto(CALM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');

  // ---- Paused: the hue holds still for as long as the overlay is up --------
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-screen')).toBeVisible();
  await settle(page);
  const paused = await sampleBall(page);
  const pausedAt = (await snapshot(page)).activeTimeMs;
  expectFrozenBallFill(paused);

  // A cycle and a half of wall clock passes with the maze frozen.
  await page.waitForTimeout(BALL_HUE_CYCLE_MS * 1.5);
  expect((await snapshot(page)).activeTimeMs).toBe(pausedAt);
  expect(await sampleBall(page)).toEqual(paused);

  // ---- Resuming picks the cycle up where it stopped ------------------------
  // A cycle and a half passed while paused. Playing for a moment and pausing
  // again compares two frozen samples, so if the return had spent that hidden
  // time on the cycle the second one would be most of a revolution away.
  await resume(page);
  await advanceActiveTime(page, BALL_HUE_CYCLE_MS / 20);
  await pause(page);
  await settle(page);

  const restarted = await snapshot(page);
  // Only the moment of play was spent, not the pause: the clock, and with it
  // the hue, carried on from where it stopped.
  expect(restarted.activeTimeMs - pausedAt).toBeLessThan(BALL_HUE_CYCLE_MS / 4);
  expect(distance(paused, await sampleBall(page))).toBeLessThan(60);

  await resume(page);

  // ---- The countdown after a wrong letter freezes it too -------------------
  await chaseUntilCaught(page, MAZE);
  await page.locator('[data-letter="Z"]').click();
  await expect(page.locator('#resume-overlay')).toBeVisible();
  await settle(page);

  const counting = await sampleBall(page);
  const countingAt = (await snapshot(page)).activeTimeMs;
  expectFrozenBallFill(counting);
  await page.waitForTimeout(600);
  expect((await snapshot(page)).activeTimeMs).toBe(countingAt);
  expect(await sampleBall(page)).toEqual(counting);

  // Back in the chase it moves again: a third of a cycle later, paused so the
  // sample is comparable with the one taken during the countdown, the colour
  // has visibly changed.
  await expect.poll(async () => (await snapshot(page)).status, { timeout: 8_000 }).toBe('chase');
  await advanceActiveTime(page, BALL_HUE_CYCLE_MS / 3);
  await pause(page);
  await settle(page);
  expect(distance(counting, await sampleBall(page))).toBeGreaterThan(20);
});

test('both halves of a ball crossing the tunnel share one colour', async ({ page }, testInfo) => {
  // The ball rolls along the tunnel row under its own policy; the journey only
  // decides when to stop the clock, never where the ball is.
  await startSeamRound(page);
  await parkBallOnSeam(page);
  await settle(page);

  const straddling = await snapshot(page);
  const x = straddling.ball?.x ?? 0;
  expect(x).toBeGreaterThan(MAZE.width - 0.7);
  expect(x).toBeLessThan(MAZE.width - 0.3);

  // One frozen frame, two sample points a whole maze width apart: the body
  // about to leave the right-hand side and the body arriving on the left.
  const main = await sampleBall(page, -0.2);
  const wrapped = await sampleBall(page, -MAZE.width + 0.2);
  expectFrozenBallFill(main);
  expectFrozenBallFill(wrapped);
  expect(wrapped).toEqual(main);

  await saveCanvas(page, `docs/evidence/m3/${testInfo.project.name}-ball-seam.png`);
});
