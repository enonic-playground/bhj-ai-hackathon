import { expect, test, type Page } from '@playwright/test';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { FIXTURE, chaseUntilCaught, snapshot } from './support.js';

declare global {
  interface Window {
    /** Test control over frame delivery and page visibility; see below. */
    __tab?: {
      hide: () => void;
      show: () => void;
      deliverOneFrame: () => Promise<void>;
      resume: () => void;
    };
  }
}

/**
 * A backgrounded tab cannot be produced from Playwright: Chromium keeps a page
 * it drives visible, frames and all. So the page itself takes over the two
 * things a hidden tab does — it reports `hidden` and it stops delivering
 * animation frames — while everything under test stays the shipped code: the
 * shell's own `visibilitychange` handler, its frame callback and its loop.
 *
 * The point of the check is that the first frame after an absence advances
 * nothing at all. Because the test decides exactly when that frame arrives,
 * the assertions are exact rather than timing-dependent: before the fix for
 * M2-R1, that single frame replayed the loop's catch-up bound of about 100 ms.
 */
async function installTabControl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const deliver = window.requestAnimationFrame.bind(window);
    const held: FrameRequestCallback[] = [];
    let paused = false;
    let hidden = false;

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => (hidden ? 'hidden' : 'visible'),
    });

    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      if (paused) {
        held.push(callback);
        return 0;
      }
      return deliver(callback);
    };

    const take = (): FrameRequestCallback[] => held.splice(0, held.length);

    window.__tab = {
      hide: () => {
        paused = true;
        hidden = true;
        document.dispatchEvent(new Event('visibilitychange'));
      },
      show: () => {
        hidden = false;
        document.dispatchEvent(new Event('visibilitychange'));
      },
      deliverOneFrame: () =>
        new Promise((resolve) => {
          const callbacks = take();
          deliver((time) => {
            for (const callback of callbacks) callback(time);
            resolve();
          });
        }),
      resume: () => {
        paused = false;
        for (const callback of take()) deliver(callback);
      },
    };
  });
}

const HIDDEN_MS = 3_000;

async function hide(page: Page): Promise<void> {
  await page.evaluate(() => window.__tab?.hide());
  await page.waitForTimeout(100); // Let any frame already in flight land.
}

async function returnWithOneFrame(page: Page): Promise<void> {
  await page.evaluate(() => window.__tab?.show());
  await page.evaluate(() => window.__tab?.deliverOneFrame());
}

test.beforeEach(async ({ page }) => {
  await installTabControl(page);
});

test('the first frame back from a hidden tab moves nothing', async ({ page }) => {
  await page.goto('/?testBall=off');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).score, { timeout: 5_000 }).toBeGreaterThan(0);

  await hide(page);
  const parked = await snapshot(page);

  await page.waitForTimeout(HIDDEN_MS); // No frames arrive at all.
  expect(await snapshot(page)).toEqual(parked);

  await returnWithOneFrame(page);
  expect(await snapshot(page)).toEqual(parked);

  // Frames after the return do their ordinary work.
  await page.evaluate(() => window.__tab?.resume());
  await expect
    .poll(async () => (await snapshot(page)).player.x, { timeout: 5_000 })
    .toBeLessThan(parked.player.x);
});

test('the resume countdown spends no hidden time', async ({ page }) => {
  await page.goto(FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await chaseUntilCaught(page, createLevelOneMaze());
  await page.locator('[data-letter="Z"]').click();
  await expect(page.locator('#resume-overlay')).toBeVisible();

  await hide(page);
  const parked = await snapshot(page);
  expect(parked.status).toBe('resuming');
  expect(parked.resumeRemainingMs).toBeGreaterThan(0);

  await page.waitForTimeout(HIDDEN_MS); // Longer than the whole countdown.
  await returnWithOneFrame(page);

  const back = await snapshot(page);
  expect(back.status).toBe('resuming');
  expect(back.resumeRemainingMs).toBe(parked.resumeRemainingMs);
  expect(back.player).toEqual(parked.player);
  expect(back.ball).toEqual(parked.ball);

  // The countdown then runs out on visible time and the chase resumes.
  await page.evaluate(() => window.__tab?.resume());
  await expect.poll(async () => (await snapshot(page)).status, { timeout: 5_000 }).toBe('chase');
});
