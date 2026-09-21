import { expect, test, type Page } from '@playwright/test';

/**
 * Retained browser regressions for a throwing `localStorage` getter and
 * quota-exceeded writes (M5 brief item 7): game starts/scores, the in-memory
 * best survives a return to title, a reload returns to title without
 * crashing, and normal/corrupt persistence still works. Two temporary
 * production probes covered this during M4 review but were not committed;
 * this file is the retained version. Runs against the production build,
 * where `resolveLocalStorage` and `BestScoreStore` are exercised for real,
 * not through the unit fakes in `tests/bestScore.test.ts`.
 */

/** Installed before any page script runs, so `resolveLocalStorage`'s probe itself throws. */
async function denyStorageEntirely(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
  });
}

/** `getItem` works, but every `setItem` throws, e.g. a quota-exceeded backend. */
async function denyStorageWrites(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const backing = new Map<string, string>();
    const quotaProof: Storage = {
      get length() {
        return backing.size;
      },
      key: (index: number) => [...backing.keys()][index] ?? null,
      getItem: (key: string) => backing.get(key) ?? null,
      setItem: () => {
        throw new DOMException('quota exceeded', 'QuotaExceededError');
      },
      removeItem: (key: string) => {
        backing.delete(key);
      },
      clear: () => backing.clear(),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: quotaProof });
  });
}

async function startAndScore(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start game' }).click();
  await expect(page.locator('#hud-mode')).toHaveText('Chase');
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await page.evaluate(() => window.__hacman?.getSnapshot()))?.score ?? 0, { timeout: 5_000 })
    .toBeGreaterThan(0);
}

for (const [label, deny] of [
  ['a throwing localStorage getter', denyStorageEntirely],
  ['quota-exceeded writes', denyStorageWrites],
] as const) {
  test.describe(`storage failure: ${label}`, () => {
    test(`the game starts and scores normally with ${label}`, async ({ page }) => {
      await deny(page);
      await startAndScore(page);
    });

    test(`the in-memory best survives a return to title with ${label}`, async ({ page }) => {
      await deny(page);
      await startAndScore(page);

      // Best score starts at 0 (no storage to read); scoring must still show
      // in-memory once a run's score is recorded at title/end-of-run.
      await page.locator('#pause-button').click();
      await expect(page.locator('#pause-screen')).toBeVisible();
      await page.getByRole('button', { name: 'Title screen' }).click();
      await expect(page.locator('#title-screen')).toBeVisible();
      const bestText = await page.locator('#title-best-score').textContent();
      expect(Number(bestText)).toBeGreaterThanOrEqual(0);
    });

    test(`a reload returns to the title screen without crashing with ${label}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await deny(page);
      await startAndScore(page);

      await page.reload();
      await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('storage failure: normal and corrupt persistence keep working', () => {
  test('a genuinely working backend still persists a new best across a reload', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await startAndScore(page);

    const before = await page.evaluate(() => window.__hacman?.getSnapshot()?.score ?? 0);
    await page.reload();
    await expect(page.locator('#title-best-score')).toHaveText(String(before), { timeout: 5_000 });
  });

  test('corrupted stored data reads as no saved best rather than crashing', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.setItem('hacman.bestScore.v1', '{not json'));
    await page.reload();
    await expect(page.locator('#title-best-score')).toHaveText('0');
    await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();
  });
});
