import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const TEMPLATE_PATH = path.resolve(import.meta.dirname, '../sw/service-worker.template.js');

interface ActivateHandler {
  activate(): Promise<string[]>;
}

/**
 * Loads the real worker template — the exact source the build ships, not a
 * reimplementation of it — with its markers filled in, inside a minimal
 * sandbox that only ever needs to answer the `activate` handler's own calls
 * (`caches.keys`/`delete`). Verifies M5-R1: activation must delete only
 * stale versions of *this worker's own* scope, never a sibling or nested
 * app's cache that merely shares a string prefix.
 */
function loadWorker(scope: string, version: string, existingCacheNames: readonly string[]): ActivateHandler {
  const template = readFileSync(TEMPLATE_PATH, 'utf8')
    .replace('__HACMAN_SW_VERSION__', version)
    .replace('__HACMAN_PRECACHE_URLS__', JSON.stringify(['index.html']));

  const listeners = new Map<string, (event: { waitUntil(promise: Promise<unknown>): void }) => void>();
  const deleted: string[] = [];

  const sandbox = {
    URL,
    self: {
      addEventListener: (type: string, handler: (event: { waitUntil(promise: Promise<unknown>): void }) => void) => {
        listeners.set(type, handler);
      },
      registration: { scope },
      location: new URL(scope),
    },
    caches: {
      keys: async () => [...existingCacheNames],
      delete: async (name: string) => {
        deleted.push(name);
        return true;
      },
      open: async (name: string) => ({ name, addAll: async () => undefined, match: async () => undefined }),
    },
    fetch: async () => {
      throw new Error('fetch should not run for an activate-only check');
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(template, sandbox);

  return {
    async activate(): Promise<string[]> {
      const activateListener = listeners.get('activate');
      if (!activateListener) throw new Error('the template never registered an activate listener');
      let waited: Promise<unknown> = Promise.resolve();
      activateListener({
        waitUntil: (promise) => {
          waited = promise;
        },
      });
      await waited;
      return deleted;
    },
  };
}

describe('service worker cache scope isolation (M5-R1)', () => {
  it('at the origin root, deletes only this scope\'s own stale version', async () => {
    const worker = loadWorker('http://example.test/', 'new-version', [
      'hacman-cache:/:old-version',
      'hacman-cache:/:new-version',
      'hacman-cache:/other-app/:valid', // a sibling app rooted deeper — root is a string prefix of this, but not its scope.
      'unrelated-cache-name',
    ]);
    expect(await worker.activate()).toEqual(['hacman-cache:/:old-version']);
  });

  it('at a nested subpath, deletes only this scope\'s own stale version', async () => {
    const worker = loadWorker('http://example.test/game/', 'new-version', [
      'hacman-cache:/game/:old-version',
      'hacman-cache:/game/:new-version',
      'hacman-cache:/game/other/:valid', // a nested sibling — /game/ is a string prefix of this, but not its scope.
      'hacman-cache:/:root-app',
    ]);
    expect(await worker.activate()).toEqual(['hacman-cache:/game/:old-version']);
  });

  it('deletes nothing when only its own current version exists', async () => {
    const worker = loadWorker('http://example.test/', 'only-version', ['hacman-cache:/:only-version']);
    expect(await worker.activate()).toEqual([]);
  });

  it('deletes every stale version of its own scope, not only the first', async () => {
    const worker = loadWorker('http://example.test/', 'v3', [
      'hacman-cache:/:v1',
      'hacman-cache:/:v2',
      'hacman-cache:/:v3',
    ]);
    expect(await worker.activate()).toEqual(['hacman-cache:/:v1', 'hacman-cache:/:v2']);
  });
});
