/**
 * Build-time constant defined by `vite.config.ts`. It is `true` only in the
 * test-only fixture build (`npm run build:fixture`) and `false` in `npm run
 * dev`, `npm run build` and the unit test run, so the deterministic start-up
 * parameters in `src/app/fixture.ts` never take effect outside that build and
 * are tree-shaken out of ordinary production output.
 */
declare const __TEST_FIXTURES__: boolean;
