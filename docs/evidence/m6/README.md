# M6 release rehearsal evidence

Fresh-checkout rehearsal of candidate `808be0f0d5d2a6cdd84a5de683fda311e797bfe9`, run by Claude on 2026-09-24.

- Checkout: `git clone` of the local repository into an empty scratch directory, then `git checkout` of the candidate SHA. `00-env.txt` lists the clone's contents before any command ran: no `node_modules`, `dist`, `dist-fixture` or `test-results`.
- Runtime: Node 22.12.0 / npm 10.9.0 (official nodejs.org darwin-arm64 tarball, SHA-256 verified against `SHASUMS256.txt`, first on `PATH`), macOS 15.7.9 arm64.
- Commands, in README order, each logged with its exit code and duration: `01-npm-ci.log` through `07-test-e2e.log`. `summary.txt` lists the exit codes.
- `09-entrypoints.log`: `npm run dev`, then a rebuild and `npm run preview` (page and `sw.js`), each answering HTTP 200. It also checks relative asset paths in `dist/index.html`, confirms that no root-absolute references and no fixture parameter names appear in `dist/`, that `dist-fixture/` does contain them and has no `sw.js`, and shows the clone's final `git status`.
- The Playwright Chromium build was already in the user-level cache (`~/Library/Caches/ms-playwright`), so `npx playwright install chromium` finished without downloading. That cache is outside the repository.
- The final `git status` shows only the 64 evidence screenshots under `docs/evidence/m3`–`m5` that the browser suite rewrites on every run. No package, lockfile, source or configuration file changed.

Local scratch paths are replaced by `<scratchpad>`. ANSI colour codes are stripped.
