import { expect, test, type Page } from '@playwright/test';
import { describeOfflineStatus } from '../src/app/pwaStatus.js';

/**
 * These journeys belong to the `production` project: PWA/offline behaviour
 * must be checked against built ordinary production output, not the dev
 * server or the fixture build (M5 brief item 5/8). Real installation and
 * offline checks on actual devices remain separate, recorded evidence — see
 * `handoffs/M5.md`.
 */

async function waitForOfflineReady(page: Page): Promise<void> {
  await expect(page.locator('#pwa-offline-status')).toHaveText(describeOfflineStatus('ready'), {
    timeout: 20_000,
  });
  // `navigator.serviceWorker.ready` resolves once an active worker controls
  // this scope, which is the strongest available signal that installation
  // (the cache.addAll() in the worker's install handler) really completed.
  await page.evaluate(() => navigator.serviceWorker.ready);
}

test.describe('manifest and icons', () => {
  test('the manifest is linked, valid, and its icons exist at the declared sizes', async ({ page, request }) => {
    await page.goto('/');
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(manifestHref).toBeTruthy();

    const manifestResponse = await request.get(new URL(manifestHref as string, page.url()).toString());
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json();

    expect(manifest.name).toBe('Hac-Man');
    expect(manifest.display).toBe('standalone');
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true);

    for (const icon of manifest.icons as Array<{ src: string; sizes: string }>) {
      const iconUrl = new URL(icon.src, manifestResponse.url()).toString();
      const iconResponse = await request.get(iconUrl);
      expect(iconResponse.ok(), `icon ${icon.src} did not resolve`).toBe(true);
      const body = await iconResponse.body();
      // A minimal but real check that this is the declared square size: the
      // PNG IHDR chunk's width/height fields sit at fixed byte offsets.
      const width = body.readUInt32BE(16);
      const height = body.readUInt32BE(20);
      const [declaredWidth] = icon.sizes.split('x').map(Number);
      expect(width).toBe(declaredWidth);
      expect(height).toBe(declaredWidth);
    }

    const appleTouchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(appleTouchIcon).toBeTruthy();
    const appleResponse = await request.get(new URL(appleTouchIcon as string, page.url()).toString());
    expect(appleResponse.ok()).toBe(true);
  });
});

test.describe('service worker install and offline preparation', () => {
  test('registers, precaches the app, and reports offline readiness on the title screen', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto('/');
    await waitForOfflineReady(page);

    const cacheNames = await page.evaluate(() => caches.keys());
    expect(cacheNames.some((name) => name.startsWith('hacman-cache:'))).toBe(true);

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const ourCache = names.find((name) => name.startsWith('hacman-cache:'));
      if (!ourCache) return [];
      const cache = await caches.open(ourCache);
      const requests = await cache.keys();
      return requests.map((request) => new URL(request.url).pathname);
    });
    expect(cached.some((path) => path.endsWith('index.html'))).toBe(true);
    expect(cached.some((path) => path.endsWith('manifest.webmanifest'))).toBe(true);
    expect(cached.some((path) => /\.js$/.test(path))).toBe(true);
    expect(cached.some((path) => /icon-192\.png$/.test(path))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('after preparation, a reload and a fresh tab in the same profile both work offline', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await waitForOfflineReady(page);

    await context.setOffline(true);

    // The reload of the tab that just prepared the cache.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();

    // A fresh top-level navigation in a new tab of the same prepared
    // profile — not merely the same document instance reloading.
    const freshPage = await context.newPage();
    await freshPage.goto('/');
    await expect(freshPage.getByRole('button', { name: 'Start game' })).toBeVisible();
    await freshPage.getByRole('button', { name: 'Start game' }).click();
    await expect(freshPage.locator('#hud-mode')).toHaveText('Chase');

    // Real controls, real scoring, entirely offline.
    await freshPage.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => (await freshPage.evaluate(() => window.__hacman?.getSnapshot()))?.score ?? 0, {
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    await freshPage.close();
    await context.setOffline(false);
  });

  test('a missing precached script is not answered with the HTML shell', async ({ page, context }) => {
    await page.goto('/');
    await waitForOfflineReady(page);
    await context.setOffline(true);

    const response = await page.evaluate(async () => {
      try {
        const result = await fetch('./assets/definitely-not-a-real-precached-file.js');
        return { ok: result.ok, status: result.status, contentType: result.headers.get('content-type') };
      } catch (error) {
        return { threw: String(error) };
      }
    });

    // Either the request fails outright, or the worker/browser answers with
    // something that is not a disguised HTML document.
    if ('threw' in response) {
      expect(response.threw).toBeTruthy();
    } else {
      expect(response.contentType ?? '').not.toContain('text/html');
    }
    await context.setOffline(false);
  });
});

test.describe('an entirely fresh, never-online browser profile', () => {
  test('offline before any online visit cannot play, and fails visibly rather than lying', async ({ browser }) => {
    const context = await browser.newContext({ offline: true });
    const page = await context.newPage();
    let failed = false;
    try {
      await page.goto('/', { timeout: 10_000 });
    } catch {
      failed = true;
    }
    // Documented limitation (README/handoff): a first-ever visit cannot
    // install uncached assets, so it must not silently pretend to work.
    if (!failed) {
      const bodyText = await page.locator('body').innerText().catch(() => '');
      expect(bodyText).not.toContain('Start game');
    }
    await context.close();
  });
});
