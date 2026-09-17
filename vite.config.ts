import { defineConfig } from 'vite';

/**
 * `--mode fixture` produces the test-only build that reads the deterministic
 * start-up parameters. Every other mode, including the ordinary production
 * build and the dev server, compiles `__TEST_FIXTURES__` to `false`, so the
 * fixture branch and its module are dropped from the bundle.
 */
export default defineConfig(({ mode }) => ({
  base: './',
  define: {
    __TEST_FIXTURES__: JSON.stringify(mode === 'fixture'),
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  preview: {
    // Bind explicitly: the default host resolves to IPv6 only on macOS.
    host: '127.0.0.1',
    port: 4173,
  },
}));
