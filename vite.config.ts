import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Recursively lists every file already written under `dir`, as POSIX-style
 * paths relative to it. Runs in `closeBundle`, once Vite has written both its
 * own hashed chunks/assets and the verbatim-copied `public/` files (icons,
 * the manifest) to disk, so this is the one place that sees the complete,
 * real build output without having to track the two sources separately.
 */
function listFiles(dir: string, base = dir): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(full, base));
    } else {
      files.push(path.relative(base, full).split(path.sep).join('/'));
    }
  }
  return files.sort();
}

/**
 * Emits `dist/sw.js` from `sw/service-worker.template.js`, filling in the
 * real precache list (every file the production build actually wrote,
 * relative filenames only — the worker resolves them against its own scope
 * at runtime, so the same output works at the origin root or a subpath) and
 * a version derived from that list plus `index.html`'s content, since that
 * one precached file's name is never content-hashed by Vite. Applies only to
 * the ordinary production build: `npm run build:fixture` and the dev server
 * must never register this worker (D020).
 */
function hacmanServiceWorkerPlugin(): Plugin {
  let outDir = '';
  return {
    name: 'hacman-service-worker',
    apply: 'build',
    configResolved(config) {
      // The real, resolved output directory: honors a CLI `--outDir`
      // override too, which is how a test can build a second, distinct
      // version without touching the shared `dist/` another test may be
      // serving at the same time.
      outDir = config.build.outDir;
    },
    closeBundle() {
      const templatePath = path.resolve(import.meta.dirname, 'sw/service-worker.template.js');
      if (!existsSync(outDir) || !existsSync(templatePath)) {
        return;
      }

      const precacheUrls = listFiles(outDir);
      const indexHtmlPath = path.join(outDir, 'index.html');
      const indexHtmlContent = existsSync(indexHtmlPath) ? readFileSync(indexHtmlPath) : Buffer.alloc(0);
      const version = createHash('sha256')
        .update(precacheUrls.join('\n'))
        .update(indexHtmlContent)
        .digest('hex')
        .slice(0, 16);

      const template = readFileSync(templatePath, 'utf8');
      const source = template
        .replace('__HACMAN_SW_VERSION__', version)
        .replace('__HACMAN_PRECACHE_URLS__', JSON.stringify(precacheUrls));

      writeFileSync(path.join(outDir, 'sw.js'), source);
      console.log(
        `hacman-service-worker: wrote ${path.join(outDir, 'sw.js')}, version ${version}, ${precacheUrls.length} precached files`,
      );
    },
  };
}

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
    outDir: 'dist', // `build:fixture` overrides this to `dist-fixture` via its own `--outDir` flag.
  },
  // The service worker is only ever emitted for the ordinary production
  // build: the fixture build's own `outDir` override above means it would
  // write into the wrong directory anyway, but gating on `mode` here also
  // keeps it out of `npm run dev`, which never runs a `build` hook at all.
  plugins: mode === 'production' ? [hacmanServiceWorkerPlugin()] : [],
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
