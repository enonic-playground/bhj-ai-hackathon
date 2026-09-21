import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { computeServiceWorkerSource } from '../vite.config.js';

const REAL_TEMPLATE_PATH = path.resolve(import.meta.dirname, '../sw/service-worker.template.js');

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop() as string;
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeBuildDir(iconContent: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hacman-sw-version-'));
  cleanupDirs.push(dir);
  writeFileSync(path.join(dir, 'index.html'), '<html></html>');
  mkdirSync(path.join(dir, 'icons'));
  writeFileSync(path.join(dir, 'icons', 'icon-192.png'), iconContent);
  return dir;
}

/**
 * Exercises the real `computeServiceWorkerSource` (used by the build's own
 * plugin) directly against small controlled directories, rather than only
 * through a full `vite build` — regressions for M5-R2: an unhashed public
 * file's content, and the worker template's own content, must each change
 * the emitted version even when every precached filename stays the same.
 */
describe('service worker version fingerprint (M5-R2)', () => {
  it('changes when a precached file\'s content changes, even though every filename stays the same', () => {
    const outDir = makeBuildDir('icon-bytes-v1');
    const before = computeServiceWorkerSource(outDir, REAL_TEMPLATE_PATH);
    writeFileSync(path.join(outDir, 'icons', 'icon-192.png'), 'icon-bytes-v2');
    const after = computeServiceWorkerSource(outDir, REAL_TEMPLATE_PATH);

    expect(before?.precacheUrls).toEqual(after?.precacheUrls);
    expect(before?.version).not.toBe(after?.version);
    expect(before?.source).not.toBe(after?.source);
  });

  it('changes when the worker template itself changes, independent of the build output', () => {
    const outDir = makeBuildDir('icon-bytes');
    const templateDir = mkdtempSync(path.join(tmpdir(), 'hacman-sw-template-'));
    cleanupDirs.push(templateDir);
    const templatePath = path.join(templateDir, 'service-worker.template.js');

    writeFileSync(
      templatePath,
      "const VERSION = '__HACMAN_SW_VERSION__';\nconst PRECACHE_URLS = __HACMAN_PRECACHE_URLS__;\n",
    );
    const before = computeServiceWorkerSource(outDir, templatePath);
    writeFileSync(
      templatePath,
      "const VERSION = '__HACMAN_SW_VERSION__';\nconst PRECACHE_URLS = __HACMAN_PRECACHE_URLS__;\n// a template-only edit\n",
    );
    const after = computeServiceWorkerSource(outDir, templatePath);

    expect(before?.precacheUrls).toEqual(after?.precacheUrls);
    expect(before?.version).not.toBe(after?.version);
  });

  it('is stable when nothing actually changed', () => {
    const outDir = makeBuildDir('icon-bytes');
    const first = computeServiceWorkerSource(outDir, REAL_TEMPLATE_PATH);
    const second = computeServiceWorkerSource(outDir, REAL_TEMPLATE_PATH);
    expect(first?.version).toBe(second?.version);
    expect(first?.source).toBe(second?.source);
  });

  it('returns null when the output directory does not exist', () => {
    expect(computeServiceWorkerSource('/does/not/exist', REAL_TEMPLATE_PATH)).toBeNull();
  });
});
