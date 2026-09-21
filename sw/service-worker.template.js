/**
 * Hac-Man's production service worker. Generated at build time by the
 * `hacmanServiceWorker` plugin in `vite.config.ts`, which replaces the two
 * markers below with the real, hashed asset list and a version derived from
 * it; see `README.md`'s PWA section and D020/D021 for the design.
 *
 * Deliberately does NOT call `self.skipWaiting()` or `clients.claim()`
 * anywhere. That is what makes this the "native waiting lifecycle" the M5
 * brief prefers: a newly installed version sits in `waiting` and only
 * becomes `active` once every tab controlled by the previous version has
 * closed, which is the platform's own default behaviour. No controlled tab
 * is ever reloaded or interrupted by this file.
 *
 * All cached URLs are written and read as paths relative to this script's
 * own location, which the Fetch/Cache APIs resolve against `self.location`
 * (this file's own scope) rather than the page — so the same source works
 * whether the app is hosted at the origin root or under a subpath.
 */
const VERSION = '__HACMAN_SW_VERSION__';
const PRECACHE_URLS = __HACMAN_PRECACHE_URLS__;

// Cache Storage is shared by the whole origin, not scoped per service
// worker: an app hosted at a different path on the same origin must not
// collide with or delete this app's caches (or vice versa), so every cache
// name is namespaced by this worker's own registration scope.
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const CACHE_PREFIX = `hacman-cache:${SCOPE_PATH}`;
const CACHE_NAME = `${CACHE_PREFIX}:${VERSION}`;

// This cache only ever holds this worker's own precached build output, never
// third-party or content-negotiated responses, so a `Vary` header the origin
// server happens to send (e.g. `Vary: Origin` on a `crossorigin` script/style
// request, which some static file servers add) must never make a real,
// present entry invisible to `match()`.
const MATCH_OPTIONS = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // `addAll` is atomic: if any single asset fails to fetch, the whole
      // install rejects, the browser discards this worker version, and
      // whatever was previously active/waiting is left exactly as it was.
      // That is the "a failed/partial download leaves the prior playable
      // version intact" requirement, with no extra bookkeeping needed here.
      await cache.addAll(PRECACHE_URLS);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => {
            if (key === CACHE_NAME) return false;
            // A plain `startsWith(CACHE_PREFIX)` is not enough: the root
            // scope "/" is itself a *string* prefix of every deeper scope
            // ("/other-app/", "/game/other/", ...), so it would also match
            // and delete a sibling or nested app's own valid cache. Parsing
            // the scope back out and comparing it for exact equality (not
            // prefix) is what actually confines deletion to this worker's
            // own scope, however that scope nests relative to another app's.
            const match = /^hacman-cache:(.*):[^:]+$/.exec(key);
            return match !== null && match[1] === SCOPE_PATH;
          })
          .map((key) => caches.delete(key)),
      );
    })(),
  );
  // No self.clients.claim() here: existing controlled clients (an active or
  // paused run in another tab) keep the worker and cache version they
  // started with until they are closed and reopened.
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return; // Only idempotent reads are ever cached.
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return; // Cross-origin requests are never intercepted.
  }
  if (!url.pathname.startsWith(SCOPE_PATH)) {
    return; // Outside this app's own path: leave it to the network/browser.
  }

  if (request.mode === 'navigate') {
    // Any in-scope navigation resolves to the cached single-page shell, so a
    // fresh offline launch (not only a reload of an already-open tab) works.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached =
          (await cache.match(request, MATCH_OPTIONS)) ?? (await cache.match('index.html', MATCH_OPTIONS));
        if (cached) {
          return cached;
        }
        try {
          return await fetch(request);
        } catch (error) {
          const fallback = await cache.match('index.html', MATCH_OPTIONS);
          if (fallback) {
            return fallback;
          }
          throw error;
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, MATCH_OPTIONS);
      if (cached) {
        return cached;
      }
      // A precached script or icon that is somehow missing is never answered
      // with the HTML shell: it either comes from the network or fails.
      return fetch(request);
    })(),
  );
});
