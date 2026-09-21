import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Maze } from '../src/game/maze.js';
import { createLevelOneMaze } from '../src/game/mazeData.js';
import { WORD_BANK, type WordEntry } from '../src/game/words.js';
import { describeOfflineStatus } from '../src/app/pwaStatus.js';
import { chaseUntilCaught, snapshot } from './support.js';

/**
 * M5-R5: the existing `pwa.spec.ts` journeys only ever exercise the origin
 * root and never solve a single word offline, but the app is actually
 * deployed at the repository subpath (see the GitHub Pages diagnostic in
 * `STATUS.md`) and the brief requires "all five levels work offline". This
 * file reproduces that real subpath and completes an entire five-level
 * campaign offline, entirely through real controls — no fixture
 * parameters, no state setters, and the true answer is never read from the
 * snapshot before a round decides it (`word.answer` only appears once a
 * round is already over).
 *
 * Its own dedicated static server, like `pwa-update.spec.ts`, so it can
 * build into an isolated directory rather than touching the shared `dist/`
 * another test may be serving from at the same time.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 4176;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const SUBPATH = '/bhj-ai-hackathon/';
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

function startSubpathServer(root: string): Server {
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', ORIGIN);
    if (!requestUrl.pathname.startsWith(SUBPATH)) {
      response.writeHead(404).end('not found: only the deployed subpath is served here');
      return;
    }
    const relative = requestUrl.pathname.slice(SUBPATH.length) || 'index.html';
    const filePath = path.join(root, relative);
    if (!filePath.startsWith(root)) {
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

async function waitForOfflineReady(page: Page): Promise<void> {
  await expect(page.locator('#pwa-offline-status')).toHaveText(describeOfflineStatus('ready'), {
    timeout: 20_000,
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
}

/** Every bundled word that could still be the current one, given what is visible so far. */
function candidatesFor(
  category: string,
  length: number,
  wrongLetters: readonly string[],
  mask: readonly (string | null)[],
): readonly WordEntry[] {
  return WORD_BANK.filter((entry) => {
    if (entry.word.length !== length || entry.category !== category) return false;
    if (wrongLetters.some((letter) => entry.word.includes(letter))) return false;
    return mask.every((revealed, index) => revealed === null || entry.word[index] === revealed);
  });
}

/** The untried letter present in the most remaining candidates — likely correct, and informative either way. */
function pickGuessLetter(candidates: readonly WordEntry[], used: ReadonlySet<string>): string {
  const counts = new Map<string, number>();
  for (const entry of candidates) {
    for (const letter of new Set(entry.word)) {
      if (used.has(letter)) continue;
      counts.set(letter, (counts.get(letter) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [letter, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = letter;
    }
  }
  if (!best) throw new Error('no untried letter is present in any remaining bank candidate');
  return best;
}

/**
 * Solves the current level using only what a player can see (category, mask,
 * guess outcomes) plus the same 50-word bank the build ships — exactly the
 * brief's exit-demonstration allowance: "a test can know the bundled
 * candidate bank and guess letters/chase repeatedly", never "reveal an
 * unsolved answer through runtime APIs". A correct guess keeps the guessing
 * panel open for another letter with no recatch needed; only a wrong guess
 * sends play back into the maze.
 */
async function solveLevelForReal(page: Page, maze: Maze): Promise<void> {
  for (;;) {
    let state = await snapshot(page);
    if (state.word.solved) return;
    if (state.status !== 'guess') {
      await chaseUntilCaught(page, maze);
      state = await snapshot(page);
    }
    const used = new Set([...state.word.revealedLetters, ...state.word.wrongLetters]);
    const candidates = candidatesFor(state.word.category, state.word.length, state.word.wrongLetters, state.word.mask);
    if (candidates.length === 0) {
      throw new Error(`no bank entry matches category "${state.word.category}" at length ${state.word.length}`);
    }
    const identified = candidates.length === 1 ? candidates[0] : null;
    const letter = identified
      ? (identified.word.split('').find((entryLetter) => !used.has(entryLetter)) as string)
      : pickGuessLetter(candidates, used);
    await page.locator(`[data-letter="${letter}"]`).click();
  }
}

test.describe('production subpath deployment', () => {
  test('installs, prepares and completes the whole campaign offline at the real repository path', async ({
    browser,
  }) => {
    test.setTimeout(300_000);

    const workDir = mkdtempSync(path.join(tmpdir(), 'hacman-pwa-subpath-'));
    const buildDir = path.join(workDir, 'dist');
    let server: Server | undefined;

    try {
      execFileSync('npx', ['vite', 'build', '--outDir', buildDir], { cwd: ROOT, stdio: 'pipe' });
      server = startSubpathServer(buildDir);

      const context = await browser.newContext();
      const page = await context.newPage();

      // AC4: manifest id/start_url/scope and every declared icon resolve
      // inside the deployed subpath, not the origin root.
      await page.goto(ORIGIN + SUBPATH);
      const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
      const manifestUrl = new URL(manifestHref as string, page.url());
      expect(manifestUrl.pathname.startsWith(SUBPATH)).toBe(true);
      const manifestResponse = await context.request.get(manifestUrl.toString());
      expect(manifestResponse.ok()).toBe(true);
      const manifest = await manifestResponse.json();
      expect(new URL(manifest.start_url, manifestUrl).pathname.startsWith(SUBPATH)).toBe(true);
      expect(new URL(manifest.scope, manifestUrl).pathname.startsWith(SUBPATH)).toBe(true);
      for (const icon of manifest.icons as Array<{ src: string }>) {
        const iconUrl = new URL(icon.src, manifestUrl);
        expect(iconUrl.pathname.startsWith(SUBPATH)).toBe(true);
        expect((await context.request.get(iconUrl.toString())).ok()).toBe(true);
      }

      await waitForOfflineReady(page);
      const registeredScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
      expect(new URL(registeredScope).pathname.startsWith(SUBPATH)).toBe(true);

      // AC5: after that one preparation, going offline and both reloading
      // this tab and opening a brand-new one at the subpath still work.
      await context.setOffline(true);
      await page.reload();
      await expect(page.getByRole('button', { name: 'Start game' })).toBeVisible();

      const freshTab = await context.newPage();
      await freshTab.goto(ORIGIN + SUBPATH);
      await expect(freshTab.getByRole('button', { name: 'Start game' })).toBeVisible();

      // AC5: a complete five-level campaign, offline, through real controls.
      const maze = createLevelOneMaze();
      await freshTab.getByRole('button', { name: 'Start game' }).click();
      await expect(freshTab.locator('#hud-level')).toHaveText('1/5');

      for (let level = 1; level <= 5; level += 1) {
        await expect(freshTab.locator('#hud-level')).toHaveText(`${level}/5`);
        await solveLevelForReal(freshTab, maze);
        if (level < 5) {
          await expect(freshTab.locator('#result-screen')).toBeVisible({ timeout: 15_000 });
          await freshTab.getByRole('button', { name: 'Next level' }).click();
          await expect(freshTab.locator('#result-screen')).toBeHidden();
        }
      }

      await expect(freshTab.locator('#campaign-complete-screen')).toBeVisible({ timeout: 15_000 });
      expect((await snapshot(freshTab)).status).toBe('campaign-complete');

      await context.setOffline(false);
      await context.close();
    } finally {
      server?.close();
      rmSync(workDir, { recursive: true, force: true });
    }
  });
});
