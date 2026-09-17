import { expect, test, type Page } from '@playwright/test';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { CALM_FIXTURE, chaseUntilCaught, snapshot } from './support.js';

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
 * Since M3 a hidden page also pauses the game, and coming back never resumes
 * it. These checks therefore assert both halves: no time reaches the simulation
 * while the page is away, and the state stays PAUSED until Resume is used.
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

/** Clicks Resume and lets frames flow again. */
async function resumePlay(page: Page): Promise<void> {
  await page.evaluate(() => window.__tab?.resume());
  await page.getByRole('button', { name: 'Resume' }).click();
}

test.beforeEach(async ({ page }) => {
  await installTabControl(page);
});

test('a hidden page pauses, advances nothing, and waits for Resume', async ({ page }) => {
  await page.goto('/?testBall=off&testEnemies=off');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).score, { timeout: 5_000 }).toBeGreaterThan(0);

  await hide(page);
  const parked = await snapshot(page);
  expect(parked.status).toBe('paused');
  expect(parked.pausedFrom).toBe('chase');
  expect(parked.pauseReason).toBe('away');

  await page.waitForTimeout(HIDDEN_MS); // No frames arrive at all.
  expect(await snapshot(page)).toEqual(parked);

  // The first frame back advances nothing, and coming back does not resume.
  await returnWithOneFrame(page);
  expect(await snapshot(page)).toEqual(parked);
  await expect(page.locator('#pause-screen')).toBeVisible();

  // Only the deliberate action restores play.
  await resumePlay(page);
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await snapshot(page)).player.x, { timeout: 5_000 })
    .toBeLessThan(parked.player.x);
});

test('the resume countdown spends no hidden time and stays paused on return', async ({ page }) => {
  await page.goto(CALM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await chaseUntilCaught(page, createLevelOneMaze());
  await page.locator('[data-letter="Z"]').click();
  await expect(page.locator('#resume-overlay')).toBeVisible();

  await hide(page);
  const parked = await snapshot(page);
  expect(parked.status).toBe('paused');
  expect(parked.pausedFrom).toBe('resuming');
  expect(parked.resumeRemainingMs).toBeGreaterThan(0);

  await page.waitForTimeout(HIDDEN_MS); // Longer than the whole countdown.
  await returnWithOneFrame(page);

  const back = await snapshot(page);
  expect(back.status).toBe('paused');
  expect(back.resumeRemainingMs).toBe(parked.resumeRemainingMs);
  expect(back.player).toEqual(parked.player);
  expect(back.ball).toEqual(parked.ball);

  // Resume puts the countdown back, with the time it had left, and it then
  // runs out on visible time alone.
  await resumePlay(page);
  await expect(page.locator('#hud-mode')).toHaveText('Resuming');
  await expect.poll(async () => (await snapshot(page)).status, { timeout: 5_000 }).toBe('chase');
});

test('a visible window that loses focus pauses too', async ({ page }) => {
  await page.goto('/?testBall=off&testEnemies=off');
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await snapshot(page)).score, { timeout: 5_000 }).toBeGreaterThan(0);

  // The page stays visible and frames keep arriving: only focus is lost. This
  // is the case M2 could not handle, and the reason its README claim was wrong.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const parked = await snapshot(page);
  expect(parked.status).toBe('paused');
  expect(parked.pauseReason).toBe('away');
  await expect(page.locator('#pause-screen')).toBeVisible();

  await page.waitForTimeout(600); // Frames are still being delivered.
  expect(await snapshot(page)).toEqual(parked);

  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
});

test('repeated focus and visibility events never overwrite the retained state', async ({ page }) => {
  await page.goto(CALM_FIXTURE);
  await page.getByRole('button', { name: 'Start game' }).click();
  await chaseUntilCaught(page, createLevelOneMaze());
  await expect(page.locator('#guess-panel')).toBeVisible();

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await hide(page);
  await returnWithOneFrame(page);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));

  const parked = await snapshot(page);
  expect(parked.status).toBe('paused');
  expect(parked.pausedFrom).toBe('guess'); // Not PAUSED, whatever happened.

  await resumePlay(page);
  await expect(page.locator('#hud-mode')).toHaveText('Guessing');
  await expect(page.locator('#guess-panel')).toBeVisible();
});
