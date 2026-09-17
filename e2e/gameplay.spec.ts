import { expect, test, type Page } from '@playwright/test';

declare global {
  interface Window {
    /** Records whether the page handler suppressed the browser default. */
    __keyLog?: { key: string; prevented: boolean }[];
  }
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const api = window.__hacman;
    if (!api) throw new Error('test readout is unavailable');
    return api.getSnapshot();
  });
}

async function recordKeyDefaults(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__keyLog = [];
    // Registered after the game handler, so it observes the final state.
    window.addEventListener('keydown', (event) => {
      window.__keyLog?.push({ key: event.key, prevented: event.defaultPrevented });
    });
  });
}

const consoleErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  consoleErrors.set(page, errors);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(consoleErrors.get(page) ?? []).toEqual([]);
});

test('title screen ignores movement input', async ({ page }) => {
  await recordKeyDefaults(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('KeyW');
  await page.waitForTimeout(300);

  const state = await snapshot(page);
  expect(state.status).toBe('title');
  expect(state.score).toBe(0);
  expect(state.player.direction).toBeNull();

  const log = await page.evaluate(() => window.__keyLog ?? []);
  expect(log.every((entry) => entry.prevented === false)).toBe(true);
});

test('keyboard journey: start, collect dots, and keep cleared dots cleared', async ({ page }) => {
  const start = page.getByRole('button', { name: 'Start game' });
  await expect(start).toBeFocused(); // Reachable and activatable by keyboard alone.
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  expect((await snapshot(page)).status).toBe('chase');

  await recordKeyDefaults(page);
  await page.keyboard.press('ArrowLeft');

  await expect
    .poll(async () => (await snapshot(page)).score, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(30);
  await expect(page.locator('#hud-score')).toHaveText(/[1-9]\d*/);

  const afterOutbound = await snapshot(page);
  expect(afterOutbound.player.x).toBeLessThan(10);
  expect(afterOutbound.player.y).toBe(13); // Never left the corridor row.

  // Retrace the corridor just cleared: the same dots must not score again.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  const afterReturn = await snapshot(page);
  expect(afterReturn.score).toBe(afterOutbound.score);
  expect(afterReturn.player.x).toBeGreaterThan(afterOutbound.player.x);

  const log = await page.evaluate(() => window.__keyLog ?? []);
  expect(log.length).toBeGreaterThan(0);
  expect(log.every((entry) => entry.prevented === true)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('walls stop the player and a queued turn is taken at the first junction', async ({ page }) => {
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await snapshot(page)).player.x, { timeout: 5_000 })
    .toBeCloseTo(7, 1); // Stopped by the wall at column 6.

  const stopped = await snapshot(page);
  await page.waitForTimeout(250);
  expect((await snapshot(page)).player.x).toBeCloseTo(stopped.player.x, 5);

  // Queue a turn that is illegal until the player reaches the tunnel row.
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await snapshot(page)).player.y, { timeout: 5_000 })
    .toBe(10);
  await expect
    .poll(async () => (await snapshot(page)).player.x, { timeout: 5_000 })
    .toBeLessThan(7);
});

test('the side tunnel wraps the player without leaving the maze', async ({ page }) => {
  await page.getByRole('button', { name: 'Start game' }).click();
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(600);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(120);
  await page.keyboard.press('ArrowLeft');

  await expect
    .poll(async () => (await snapshot(page)).player.x, { timeout: 8_000 })
    .toBeGreaterThan(12); // Reappeared on the right-hand side.

  const state = await snapshot(page);
  expect(state.player.x).toBeLessThan(21);
  expect(state.player.y).toBe(10);
});
