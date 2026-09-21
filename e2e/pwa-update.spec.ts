import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * The safe-update lifecycle (AC6): two real, distinct production builds
 * served at the same origin/scope, exercised through the real worker
 * lifecycle with no mocked update flag — a controlled tab's active run is
 * never touched, and the new version only takes over once every tab
 * controlled by the old one has closed and a fresh one opens.
 *
 * This is its own file, own dedicated static server (not the shared
 * `production`/`fixture` preview servers `playwright.config.ts` starts), and
 * a single test: building two real versions means briefly editing
 * `index.html` and rebuilding, and doing that from more than one worker at
 * once — which `fullyParallel: true` could otherwise cause — would race on
 * the same source file.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4175;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function buildInto(outDir: string): void {
  execFileSync('npx', ['vite', 'build', '--outDir', outDir], { cwd: ROOT, stdio: 'pipe' });
}

/** A minimal static file server whose root can be swapped between requests, simulating a redeploy at the same origin/scope. */
function startServer(getRoot: () => string): Server {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', ORIGIN);
    const requestPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const filePath = path.join(getRoot(), requestPath);
    if (!filePath.startsWith(getRoot())) {
      response.writeHead(403).end();
      return;
    }
    try {
      const body = readFileSync(filePath);
      const ext = path.extname(filePath);
      response.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  server.listen(PORT);
  return server;
}

test('a safe update never disturbs an active tab and only takes over once every tab is closed and reopened', async ({
  browser,
}) => {
  test.setTimeout(120_000);

  const workDir = mkdtempSync(path.join(tmpdir(), 'hacman-pwa-update-'));
  const buildA = path.join(workDir, 'build-a');
  const buildB = path.join(workDir, 'build-b');
  const buildC = path.join(workDir, 'build-c');
  const indexHtmlPath = path.join(ROOT, 'index.html');
  const originalIndexHtml = readFileSync(indexHtmlPath, 'utf8');
  let server: Server | undefined;
  let currentRoot = '';

  try {
    // Build A: the ordinary source, unmodified.
    buildInto(buildA);

    // Build B: a real, independently built second version. Editing the
    // title heading is enough to change `index.html`'s own bytes (never
    // content-hashed by Vite) and, in turn, the derived worker version.
    const markedHtml = originalIndexHtml.replace(
      '<h1 class="overlay__title" id="title-heading">Hac-Man</h1>',
      '<h1 class="overlay__title" id="title-heading">Hac-Man (build B)</h1>',
    );
    expect(markedHtml).not.toBe(originalIndexHtml);
    writeFileSync(indexHtmlPath, markedHtml);
    try {
      buildInto(buildB);
    } finally {
      writeFileSync(indexHtmlPath, originalIndexHtml); // Restored before anything else can read it.
    }

    // Build C: build B with one precached asset deleted, standing in for a
    // failed/partial deploy — the install must reject atomically, leaving
    // whatever was already active untouched.
    cpSync(buildB, buildC, { recursive: true });
    unlinkSync(path.join(buildC, 'icons', 'icon-192.png'));

    currentRoot = buildA;
    server = startServer(() => currentRoot);

    const context = await browser.newContext();

    // Tab 1: prepares build A and starts a run, standing in for "an active
    // tab that must never be disturbed".
    const tab1 = await context.newPage();
    await tab1.goto(ORIGIN + '/');
    await expect(tab1.locator('#title-heading')).toHaveText('Hac-Man');
    await tab1.evaluate(() => navigator.serviceWorker.ready);
    await tab1.getByRole('button', { name: 'Start game' }).click();
    await expect(tab1.locator('#hud-mode')).toHaveText('Chase');
    await tab1.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => (await tab1.evaluate(() => window.__hacman?.getSnapshot()))?.score ?? 0)
      .toBeGreaterThan(0);
    const activeScoreBeforeUpdate = await tab1.evaluate(() => window.__hacman?.getSnapshot()?.score);

    // Tab 2: a second tab at TITLE, open before the update is discovered —
    // it must not be disturbed either, and must not discard tab 1's run.
    const tab2 = await context.newPage();
    await tab2.goto(ORIGIN + '/');
    await expect(tab2.locator('#title-heading')).toHaveText('Hac-Man');

    // The "deploy": the same origin/scope now serves a distinguishable build.
    currentRoot = buildB;

    // Discover the new version without reloading either open tab.
    const registration = await tab2.evaluate(() => navigator.serviceWorker.getRegistration());
    expect(registration).toBeTruthy();
    await tab2.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    });

    await expect
      .poll(async () =>
        tab2.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.scriptURL ?? null),
      )
      .toBeTruthy();

    // Neither open tab was reloaded or otherwise disturbed: tab 1's run kept
    // running exactly as an untouched active run would (score only ever
    // rising, never reset by a reload or a forced pause), and both tabs
    // still show build A's heading.
    await expect(tab1.locator('#hud-mode')).toHaveText('Chase');
    expect(await tab1.evaluate(() => window.__hacman?.getSnapshot()?.score)).toBeGreaterThanOrEqual(
      activeScoreBeforeUpdate ?? 0,
    );
    expect(await tab1.evaluate(() => window.__hacman?.getSnapshot()?.status)).toBe('chase');
    await expect(tab2.locator('#title-heading')).toHaveText('Hac-Man'); // Still build A; never auto-reloaded.

    // Close every tab controlled by the old version. Deliberately no
    // `skipWaiting`/`clients.claim` exists anywhere in the worker: the
    // waiting version activates only once nothing controlled by the
    // previous one remains — the platform's own default behaviour.
    await tab1.close();
    await tab2.close();

    await expect
      .poll(
        async () => {
          const probe = await context.newPage();
          try {
            await probe.goto(ORIGIN + '/manifest.webmanifest', { waitUntil: 'domcontentloaded' });
            const registrations = await probe.evaluate(() =>
              navigator.serviceWorker.getRegistrations().then((list) => list.map((r) => r.active?.scriptURL)),
            );
            return registrations.length > 0 && !(await probe.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => Boolean(r?.waiting))));
          } finally {
            await probe.close();
          }
        },
        { timeout: 20_000 },
      )
      .toBe(true);

    // A genuinely fresh tab now launches build B, served entirely by the
    // newly active worker, and it still works offline.
    const tab3 = await context.newPage();
    await tab3.goto(ORIGIN + '/');
    await expect(tab3.locator('#title-heading')).toHaveText('Hac-Man (build B)');
    expect(await tab3.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null)).toBeTruthy();

    await context.setOffline(true);
    await tab3.reload();
    await expect(tab3.locator('#title-heading')).toHaveText('Hac-Man (build B)');
    await expect(tab3.getByRole('button', { name: 'Start game' })).toBeVisible();
    await context.setOffline(false);

    // A failed precache (build C, one asset missing) must not disturb the
    // now-active build B: the install rejects, no waiting worker appears,
    // and build B keeps working exactly as before.
    currentRoot = buildC;
    await tab3.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update().catch(() => undefined);
    });
    await tab3.waitForTimeout(2_000); // A failed install settles quickly; nothing to poll for succeeding.
    const afterFailedUpdate = await tab3.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return { installing: Boolean(reg?.installing), waiting: Boolean(reg?.waiting) };
    });
    expect(afterFailedUpdate.waiting).toBe(false);
    await tab3.reload();
    await expect(tab3.locator('#title-heading')).toHaveText('Hac-Man (build B)');

    await context.close();
  } finally {
    writeFileSync(indexHtmlPath, originalIndexHtml); // Idempotent safety net if an earlier step threw first.
    server?.close();
    rmSync(workDir, { recursive: true, force: true });
  }
});
