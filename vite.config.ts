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

export interface ServiceWorkerBuild {
  readonly version: string;
  readonly source: string;
  readonly precacheUrls: readonly string[];
}

/**
 * Computes the generated worker's source and version from what a build
 * actually wrote to `outDir` plus the template's own content. Exported (and
 * kept pure — no console output, no write) so `tests/serviceWorkerVersion.test.ts`
 * can exercise the real fingerprinting logic directly against small
 * controlled directories, instead of only through a full `vite build`.
 *
 * The version hashes every precached file's actual *bytes*, not just its
 * name: a build-hashed JS/CSS chunk's filename already changes on any
 * content edit, but `index.html`, the manifest and the icons are copied
 * verbatim with stable names, so a content-only edit to any of them (or to
 * the worker template itself, which is not part of `outDir` at all) would
 * otherwise leave the emitted `sw.js` byte-identical and never install for
 * an existing client (M5-R2).
 */
export function computeServiceWorkerSource(outDir: string, templatePath: string): ServiceWorkerBuild | null {
  if (!existsSync(outDir) || !existsSync(templatePath)) {
    return null;
  }

  const precacheUrls = listFiles(outDir);
  const hash = createHash('sha256');
  for (const url of precacheUrls) {
    hash.update(url);
    hash.update('\0');
    hash.update(readFileSync(path.join(outDir, url)));
    hash.update('\0');
  }
  const template = readFileSync(templatePath, 'utf8');
  hash.update(template);
  const version = hash.digest('hex').slice(0, 16);

  const source = template
    .replace('__HACMAN_SW_VERSION__', version)
    .replace('__HACMAN_PRECACHE_URLS__', JSON.stringify(precacheUrls));

  return { version, source, precacheUrls };
}

/**
 * Emits `dist/sw.js` from `sw/service-worker.template.js`, filling in the
 * real precache list (every file the production build actually wrote,
 * relative filenames only — the worker resolves them against its own scope
 * at runtime, so the same output works at the origin root or a subpath) and
 * a content-derived version (`computeServiceWorkerSource`). Applies only to
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
      const result = computeServiceWorkerSource(outDir, templatePath);
      if (!result) {
        return;
      }

      writeFileSync(path.join(outDir, 'sw.js'), result.source);
      console.log(
        `hacman-service-worker: wrote ${path.join(outDir, 'sw.js')}, version ${result.version}, ${result.precacheUrls.length} precached files`,
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
