import { defineConfig, devices } from '@playwright/test';

const PRODUCTION_PORT = 4173;
const FIXTURE_PORT = 4174;
const PRODUCTION_URL = `http://127.0.0.1:${PRODUCTION_PORT}`;
const FIXTURE_URL = `http://127.0.0.1:${FIXTURE_PORT}`;

/**
 * Browser journeys run against built output, as the PRD requires for
 * build-dependent checks, and against two builds:
 *
 * - the `desktop` and `mobile` projects serve the test-only fixture build
 *   (`npm run build:fixture`), whose deterministic start-up parameters make a
 *   round reproducible;
 * - the `production` project serves the ordinary production build (`npm run
 *   build`), plays a round with no parameters at all, and proves that the
 *   fixture parameters have no effect on it. The service worker only exists
 *   in this build (M5, brief item 7), so PWA/offline/update/storage-failure
 *   journeys belong here too.
 *
 * These production-only specs therefore belong to the production project
 * alone, and every other spec to the fixture projects.
 */
const PRODUCTION_SPEC = /(?:^|\/)(production|pwa[-.]?\w*|storage)\.spec\.ts$/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // A journey now plays a real round against four enemies, dodging them with
  // the game's own controls and waiting out any death it runs into, so a test
  // needs more than Playwright's 30-second default. It has to stay above the
  // budget `drive` gives itself in `e2e/support.ts`, or a slow chase fails the
  // test before the helper can report what it was waiting for.
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: PRODUCTION_SPEC,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        baseURL: FIXTURE_URL,
      },
    },
    {
      name: 'mobile',
      testIgnore: PRODUCTION_SPEC,
      // Emulated touch device at the PRD reference viewport. Emulation does not
      // replace the real-device checks required by M5.
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 640 }, baseURL: FIXTURE_URL },
    },
    {
      name: 'production',
      testMatch: PRODUCTION_SPEC,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        baseURL: PRODUCTION_URL,
      },
    },
  ],
  // Never reuse a server that happens to be listening: it would serve whatever
  // was built last, and a stale bundle can pass a check the current one fails.
  // `--strictPort` then reports the conflict instead of moving to another port.
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PRODUCTION_PORT} --strictPort`,
      url: PRODUCTION_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build:fixture && npm run preview:fixture -- --port ${FIXTURE_PORT} --strictPort`,
      url: FIXTURE_URL,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
