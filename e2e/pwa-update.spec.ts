import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
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
 * a single test: building three real versions means briefly editing
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

interface UpdateAttemptResult {
  readonly updateFound: boolean;
  readonly states: readonly string[];
  readonly sawInstalling: boolean;
  readonly error?: string;
  readonly timedOut?: boolean;
}

test('a safe update never disturbs an active, paused or title-screen tab, and only takes over once every tab is closed and reopened', async ({
  browser,
}) => {
  test.setTimeout(150_000);

  const workDir = mkdtempSync(path.join(tmpdir(), 'hacman-pwa-update-'));
  const buildA = path.join(workDir, 'build-a');
  const buildB = path.join(workDir, 'build-b');
  const buildBroken = path.join(workDir, 'build-broken');
  const indexHtmlPath = path.join(ROOT, 'index.html');
  const originalIndexHtml = readFileSync(indexHtmlPath, 'utf8');
  let server: Server | undefined;
  let currentRoot = '';

  const withMarkedTitle = (marker: string): string => {
    const marked = originalIndexHtml.replace(
      '<h1 class="overlay__title" id="title-heading">Hac-Man</h1>',
      `<h1 class="overlay__title" id="title-heading">Hac-Man (${marker})</h1>`,
    );
    expect(marked).not.toBe(originalIndexHtml);
    return marked;
  };

  const buildMarked = (marker: string, outDir: string): void => {
    writeFileSync(indexHtmlPath, withMarkedTitle(marker));
    try {
      buildInto(outDir);
    } finally {
      writeFileSync(indexHtmlPath, originalIndexHtml); // Restored before anything else can read it.
    }
  };

  try {
    // Build A: the ordinary source, unmodified.
    buildInto(buildA);

    // Build B: a real, independently built second version. Editing the
    // title heading is enough to change `index.html`'s own bytes and, in
    // turn, every precached file's content hash the generated worker's
    // version is derived from (M5-R2's fix).
    buildMarked('build B', buildB);

    // The broken build: a genuinely different, independently built third
    // version (its own distinct marker, so its own distinct worker version —
    // not a byte-identical copy of B, which the browser would never even
    // attempt to install; see M5-R3) with one required precached asset then
    // deleted, standing in for a failed/partial deploy.
    buildMarked('broken build', buildBroken);
    unlinkSync(path.join(buildBroken, 'icons', 'icon-192.png'));

    currentRoot = buildA;
    server = startServer(() => currentRoot);

    const context = await browser.newContext();

    // Tab 1: prepares build A and starts a run, standing in for "an active
    // tab that must never be disturbed".
    const tab1 = await context.newPage();
    await tab1.goto(ORIGIN + '/');
    await expect(tab1.locator('#title-heading')).toHaveText('Hac-Man');
    await tab1.evaluate(() => navigator.serviceWorker.ready);
    // A first-ever navigation loads before any worker exists for the scope,
    // so it is never itself controlled — `.ready` only proves an active
    // worker exists, not that this document is one of its clients. Reload
    // once so the run this update must protect is genuinely controlled by
    // build A's worker before any update is discovered (M5-R3).
    await tab1.reload();
    await expect(tab1.locator('#title-heading')).toHaveText('Hac-Man');
    expect(await tab1.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
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

    // Tab 4: a third protected tab, this one paused mid-run — the brief is
    // explicit that PAUSED still retains an active run and is not a safe
    // forced-reload boundary either (D020, M5-R3).
    const tab4 = await context.newPage();
    await tab4.goto(ORIGIN + '/');
    await tab4.getByRole('button', { name: 'Start game' }).click();
    await expect(tab4.locator('#hud-mode')).toHaveText('Chase');
    await tab4.keyboard.press('ArrowLeft');
    await expect
      .poll(async () => (await tab4.evaluate(() => window.__hacman?.getSnapshot()))?.score ?? 0)
      .toBeGreaterThan(0);
    await tab4.keyboard.press('Escape');
    await expect(tab4.locator('#pause-screen')).toBeVisible();
    const pausedScoreBeforeUpdate = await tab4.evaluate(() => window.__hacman?.getSnapshot()?.score);

    // The "deploy": the same origin/scope now serves a distinguishable build.
    currentRoot = buildB;

    // Discover the new version without reloading any open tab.
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

    // None of the three open tabs were reloaded or otherwise disturbed:
    // tab 1's active run kept running (score only ever rising, never reset
    // by a reload or a forced pause), tab 4's paused run is exactly as it
    // was left, and all three still show build A's heading. Real gameplay
    // keeps advancing on its own clock throughout this test, so tab 1's ball
    // may legitimately have been caught by now — any of these in-run states
    // (as opposed to a reset back to TITLE) proves it was never reloaded.
    const tab1Status = await tab1.evaluate(() => window.__hacman?.getSnapshot()?.status);
    expect(['chase', 'guess', 'resuming', 'countdown']).toContain(tab1Status);
    expect(await tab1.evaluate(() => window.__hacman?.getSnapshot()?.score)).toBeGreaterThanOrEqual(
      activeScoreBeforeUpdate ?? 0,
    );
    await expect(tab2.locator('#title-heading')).toHaveText('Hac-Man'); // Still build A; never auto-reloaded.
    await expect(tab4.locator('#pause-screen')).toBeVisible();
    expect(await tab4.evaluate(() => window.__hacman?.getSnapshot()?.score)).toBe(pausedScoreBeforeUpdate);
    expect(await tab4.evaluate(() => window.__hacman?.getSnapshot()?.status)).toBe('paused');
    await expect(tab4.locator('#title-heading')).toHaveText('Hac-Man');

    // Close every tab controlled by the old version. Deliberately no
    // `skipWaiting`/`clients.claim` exists anywhere in the worker: the
    // waiting version activates only once nothing controlled by the
    // previous one remains — the platform's own default behaviour.
    await tab1.close();
    await tab2.close();
    await tab4.close();

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

    // The broken build must not disturb the now-active build B: a genuinely
    // different worker (a distinct marker means a distinct content hash, so
    // the browser really attempts this install rather than silently seeing
    // byte-identical bytes and skipping it, which is exactly what M5-R3
    // found the previous build-C-as-a-copy-of-B setup let slip through)
    // installs, discovers its missing icon, and its atomic `cache.addAll()`
    // rejects — observed here through real lifecycle events/states, not an
    // arbitrary wait.
    currentRoot = buildBroken;
    const updateAttempt = await tab3.evaluate<UpdateAttemptResult>(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        return { updateFound: false, states: [], sawInstalling: false, error: 'no registration' };
      }
      return await new Promise<UpdateAttemptResult>((resolve) => {
        const states: string[] = [];
        const onUpdateFound = () => {
          const installing = reg.installing;
          if (!installing) {
            resolve({ updateFound: true, states, sawInstalling: false });
            return;
          }
          // `installing.state` is already "installing" the moment this event
          // fires — record that starting state explicitly, since the
          // subsequent `statechange` listener only reports states reached
          // *after* it attaches, and a fast local rejection can otherwise
          // jump straight to the one "redundant" event with nothing before it.
          states.push(installing.state);
          installing.addEventListener('statechange', () => {
            states.push(installing.state);
            if (installing.state === 'redundant') {
              reg.removeEventListener('updatefound', onUpdateFound);
              resolve({ updateFound: true, states, sawInstalling: true });
            }
          });
        };
        reg.addEventListener('updatefound', onUpdateFound);
        reg.update().catch((error: unknown) => resolve({ updateFound: false, states, sawInstalling: false, error: String(error) }));
        setTimeout(() => resolve({ updateFound: false, states, sawInstalling: false, timedOut: true }), 15_000);
      });
    });

    expect(updateAttempt.timedOut, `update attempt timed out; states so far: ${updateAttempt.states.join(',')}`).toBeFalsy();
    expect(updateAttempt.updateFound, updateAttempt.error).toBe(true);
    expect(updateAttempt.sawInstalling, 'the broken build never even started installing').toBe(true);
    expect(updateAttempt.states).toContain('installing');
    expect(updateAttempt.states.at(-1)).toBe('redundant');

    const afterFailedUpdate = await tab3.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return { installing: Boolean(reg?.installing), waiting: Boolean(reg?.waiting) };
    });
    expect(afterFailedUpdate.waiting).toBe(false);
    expect(afterFailedUpdate.installing).toBe(false);

    // Build B still launches and plays, both online and, once more, offline.
    await tab3.reload();
    await expect(tab3.locator('#title-heading')).toHaveText('Hac-Man (build B)');

    await context.setOffline(true);
    await tab3.reload();
    await expect(tab3.locator('#title-heading')).toHaveText('Hac-Man (build B)');
    await tab3.getByRole('button', { name: 'Start game' }).click();
    await expect(tab3.locator('#hud-mode')).toHaveText('Chase');
    await context.setOffline(false);

    await context.close();
  } finally {
    writeFileSync(indexHtmlPath, originalIndexHtml); // Idempotent safety net if an earlier step threw first.
    server?.close();
    rmSync(workDir, { recursive: true, force: true });
  }
});
