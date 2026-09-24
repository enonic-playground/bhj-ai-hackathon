# Hac-Man

A single-player progressive web app for mobile and desktop that combines maze-chase arcade action with letter-by-letter word guessing.

Chase a rolling ball through the maze while four enemies chase you. Catch it to freeze the maze and guess a letter of the level's hidden word. A correct letter lets you keep guessing; a wrong one sends you back into the maze to catch the ball again. Solving the word completes the level, whatever dots are left. Five levels make up a campaign.

The game is fully static: no server, accounts, analytics or runtime AI service. After one successful online visit it installs where the browser supports it and plays the whole campaign offline.

Project history, milestone evidence and current progress live outside this guide: [STATUS.md](STATUS.md) (current state and next action), [PRD.md](PRD.md) (accepted specification), [DECISIONS.md](DECISIONS.md) (design decisions and their reasons), [`handoffs/`](handoffs/) (per-milestone briefs, implementation evidence and reviews) and [WIREFRAMES.md](WIREFRAMES.md) (layout references). Contributors and coding agents follow [AGENTS.md](AGENTS.md).

## How to play

### Chase

- You start with three lives. Dots score 10 points each, and the four power pellets in the corners score 50.
- The ball is ringed in white and its fill drifts through the colour spectrum. It moves slower than you (80% of your speed), follows the corridors, and never enters the enemy home. It always appears at least six tiles away from you.
- Catching the ball freezes the maze and opens Guessing mode.
- Four enemies, each with its own colour and shape marker, leave their home at intervals: **Chaser** heads straight for you, **Ambusher** aims ahead of where you are going, **Patroller** walks a fixed circuit, and **Prowler** pursues from a distance but retreats when close. They alternate between scattering to their corners and chasing.
- Touching an enemy costs one life. The actors return to their starting positions, a new ball appears, and you get two seconds of protection. Your score, word, guesses and collected dots are kept.
- A power pellet turns the enemies blue for six seconds. Blue enemies can be eaten for 200, 400, 800 and then 1,600 points. An eaten enemy returns home and rejoins play. A second pellet restarts the six seconds and the point chain.
- Fruit appears twice a level, when 30% and 70% of the dots are gone, on the tile where you start. It is worth 100 points times the level number and disappears after ten seconds of play.
- Reaching 10,000 points earns one extra life, once per run.
- Clearing every dot does not end a level. The ball keeps moving, so every word can always be solved.

### Guessing

- The maze is dimmed and frozen: no enemies, timers or fruit move while you guess.
- The panel shows the word as a mask, its category and every letter already tried. Guess by typing A–Z or tapping a letter button.
- A correct letter reveals every copy and scores 100 per revealed position, and you keep guessing.
- A wrong letter is recorded, a new ball appears, and play resumes after a two-second countdown. A wrong letter does not cost a life; the risk is another chase.
- Letters already tried are disabled and cannot be guessed again.
- Solving the word scores 1,000 points. Levels one to four then show a result screen with a **Next level** action.

### Levels and the run

- Level *N* uses a word of *N* + 3 letters (4 letters on level 1 up to 8 on level 5), and enemies get slightly faster each level. No word repeats within a run.
- A new level resets the dots, pellets, fruit, guesses, actors and timers. Score and lives carry over.
- Solving level five completes the campaign and offers **Play again**. Losing your last life ends the run and reveals the word; **Restart run** starts a fresh three-life run.
- Your best score is kept on this device. Nothing else is saved: reloading always returns to the title screen.

### Controls

| Action | Keyboard | Touch / mouse |
| --- | --- | --- |
| Move | Arrow keys or W/A/S/D | On-screen direction pad |
| Turn at the next junction | Press the direction before you reach it; the turn is queued | Same, on the pad |
| Guess a letter | A–Z (W/A/S/D type letters while guessing, not moves) | Letter buttons |
| Pause | Escape | Pause button |
| Resume, restart or quit | Tab to **Resume**, **Restart run** or **Title screen** on the pause screen, then Enter or Space | Tap the same buttons |

Switching tabs, minimizing the window or losing focus pauses the game automatically. Play continues only when you choose **Resume**. Held keys and queued turns are cleared whenever the mode changes, so a move cannot carry into guessing and back.

Accessibility: every button has a label and visible focus, word updates are announced through a live region, lives and mode are shown as text as well as drawn, and touch targets are at least 44 × 44 CSS pixels. When the system asks for reduced motion, the decorative effects hold steady: the ball keeps one colour, and the pellet pulse, protection ring and frightened-enemy warning stop animating. Gameplay is identical either way. Navigating the maze itself without sight is not supported.

## Setup

### Requirements

- **Node.js `^22.12.0 || ^24.0.0 || >=26.0.0`.** Node 20, 21, 23 and 25 are not supported. `.npmrc` sets `engine-strict=true`, so `npm ci` refuses them instead of failing later inside a tool. The range is the intersection of what the pinned tools support, and Vitest 5 is the narrowest.
- **The reference runtime is Node 22.12.0**, which the GitHub Pages workflow (`.github/workflows/deploy-pages.yml`) builds with. Dependencies are pinned to exact versions in `package.json` and locked in `package-lock.json`. Always install with `npm ci`.
- **Chromium for the browser tests,** downloaded once with `npx playwright install chromium`.

For the runtimes and platforms each release check actually ran on, see the latest milestone handoff linked from [STATUS.md](STATUS.md). This guide does not record verification results.

### Quick start

```sh
npm ci
npm run dev          # http://127.0.0.1:5173
```

### Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install the pinned dependencies from the lockfile. |
| `npm run dev` | Development server on <http://127.0.0.1:5173>, with no service worker. |
| `npm run typecheck` | TypeScript check of the application, tests and configuration, without output. |
| `npm test` | Unit and integration tests (Vitest, single run). `npm run test:watch` reruns tests on changes. |
| `npm run build` | Type-check and write the production build, including `sw.js`, to `dist/`. |
| `npm run preview` | Serve `dist/` on <http://127.0.0.1:4173>. Run `npm run build` first. |
| `npm run build:fixture` | Test-only build with deterministic start-up parameters, written to `dist-fixture/`. |
| `npm run preview:fixture` | Serve `dist-fixture/` on <http://127.0.0.1:4174>. |
| `npx playwright install chromium` | One-time browser download needed by `npm run test:e2e`. |
| `npm run test:e2e` | Playwright browser journeys. Builds both outputs and starts both preview servers itself. |
| `node scripts/generate-icons.mjs` | Regenerate `public/icons/*.png` after changing the icon design. Not part of the build; commit the output. |

A full local check, in the order the milestone reviews use:

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm test
npm run build
npm run build:fixture
npm run test:e2e
```

There is no lint script. `npm run test:e2e` starts its own preview servers and refuses to reuse one already running on ports 4173 or 4174, so stop any manual `preview` first.

## Hosting, installing and playing offline

### Hosting

`npm run build` writes a static site to `dist/`. Every asset path is relative (`base: './'` in `vite.config.ts`), so the same output works at a domain root or under a subpath. The repository's workflow publishes it to GitHub Pages at `/bhj-ai-hackathon/` on every push to `main`. The Pages source must be set to **GitHub Actions** in the repository settings. The service worker needs HTTPS or `localhost`.

### Installing

- **Chrome or Edge on Android or desktop:** use the **Install Hac-Man** button that the title screen shows when the browser offers installation, or the browser's own menu or address-bar install action.
- **Safari on iOS/iPadOS:** Share → **Add to Home Screen**. Safari has no install prompt, so the title screen's **Install manually** section explains this path.
- Other browsers show best-effort instructions in the same section. Installing is optional; the game works as an ordinary web page.

An installed app opens in its own standalone window and always starts at the title screen.

### Offline

The first visit must be online. During that visit, the service worker downloads the complete app into its cache: the page, scripts and styles (which contain all words and levels), the manifest and the icons. The title screen reports when the app is ready for offline play. From then on, all five levels play without a connection, whether you reload or open a new tab. A first visit made while offline cannot prepare anything.

Only the production build registers the service worker. `npm run dev` and the test-only build do not.

### Updates

A new deployment downloads in the background into its own cache. It never replaces the running version mid-game: an active, paused or between-level run, and any other open Hac-Man tab, keep the version they started with. Once a new version is waiting, the title screen says so. It takes over the next time every Hac-Man tab or window has been closed and the app is opened again. There is no forced reload. If a download is incomplete or fails, the new version is discarded and the current one keeps working, offline included.

### Storage and recovery

- The best score is the only saved data, in `localStorage`. If storage is unavailable, blocked, full or corrupted, the game still runs and keeps the best score for the current session only.
- Caches are named `hacman-cache:<scope>:<version>`, and only this app's own old versions are ever deleted. Another app on the same origin at a different path is not affected.
- **If offline play seems stuck on old content** after closing and reopening every Hac-Man tab, clear it without losing the best score. In the browser's developer tools, open the Application panel. Close every other Hac-Man tab. Unregister this scope's worker under **Service Workers**. Under **Cache Storage**, delete only the `hacman-cache:<this app's scope>:…` entries. Then reload while online. The best score is kept, because neither step touches `localStorage`.
- The browser's site-wide **Clear data** option resets the whole origin, **including the best score**. Use it only when you want to start completely fresh.

## Architecture

TypeScript, built by Vite. The maze is drawn on a Canvas 2D element; menus, the HUD and the guessing keyboard are HTML and CSS.

| Path | Contents |
| --- | --- |
| `src/game/` | The simulation, with no DOM, canvas or timer dependencies. It covers the maze tiles and validation (`maze.ts`, `mazeData.ts`), shared movement (`actor.ts`), the ball (`ball.ts`, `spawn.ts`), enemies (`enemy.ts`, `paths.ts`), words (`words.ts`), levels (`levels.ts`), fruit (`fruit.ts`), tunables (`config.ts`), seeded randomness, the `Game` state machine (`game.ts`) and the fixed-step loop (`loop.ts`). |
| `src/input/` | Routes keys, pad presses and letter buttons to the mode that owns them. |
| `src/render/` | The canvas renderer, plus `motion.ts`, pure functions for normal and reduced-motion effects. |
| `src/app/` | Browser wiring: the DOM shell, resizing, focus, frame timing, the best-score store, the reduced-motion watcher, install/offline/update UI (`pwa.ts`, `pwaStatus.ts`) and the test-only start-up parameters (`fixture.ts`). |
| `sw/service-worker.template.js` | The service worker source. At build time, a plugin in `vite.config.ts` fills in the real list of files to cache and a version hash of their bytes, then writes the result to `dist/sw.js`. |
| `scripts/generate-icons.mjs` | Draws the app icons and writes them as PNGs, with no image dependencies. |
| `tests/`, `e2e/` | Vitest unit/integration suites and Playwright browser journeys. |

Key design points:

- **One state machine.** `Game` has the states TITLE, CHASE, GUESS, RESUMING, PAUSED, DYING, LEVEL_COMPLETE, GAME_OVER and CAMPAIGN_COMPLETE, and every transition goes through one private method. Only CHASE advances the maze; the countdown and death states advance only their own timers. A repeated event therefore cannot open guessing twice, take two lives or award a bonus twice.
- **A fixed 120 Hz simulation** runs with bounded catch-up, independent of the frame rate. Movement is split into small substeps, so actors cannot pass through each other on a slow frame. Each substep resolves movement, then collectibles, then enemy contact, then ball capture: a pellet eaten on the same substep protects you, and a lethal contact beats a simultaneous catch.
- **One movement engine and permissioned graphs.** The player, the ball and the enemies share one engine. Only an enemy entering or leaving home may use the door and home tiles. Enemies choose turns at tile centres from breadth-first path distances, never on every frame.
- **One scoring method** handles every point source and grants the single extra life.
- **Injected randomness, word selection and ball placement** let tests replay a round or campaign exactly. Ordinary games use a random seed.
- **Test-only parameters are compiled out.** `testSeed`, `testWord`, `testWords`, `testBankWord`, `testBall` and `testEnemies` are read only by the `npm run build:fixture` output (`__TEST_FIXTURES__` in `vite.config.ts`). The production bundle contains none of them. `window.__hacman.getSnapshot()` is a read-only view for browser tests that hides the unsolved word.

The browser suite has three Playwright projects: `desktop` and `mobile` (360 × 640 emulation) against the fixture build, and `production` against the ordinary build. Production covers offline play at the root and at `/bhj-ai-hackathon/` over a full five-level campaign, safe updates across three real builds, and storage failures.

## Editing content

- **Words:** `WORD_BANK` in `src/game/words.ts`. Each entry is `{ word, category }`, where the word is 4–8 upper-case letters A–Z and the category is not empty. At load, the bank is checked for duplicates (ignoring case) and for at least ten words of each length from 4 to 8, so a bad edit fails `npm test` and stops the game at startup instead of surfacing later as a repeat or a stuck level. `SEED_WORDS` in the same file is only for the test-only parameters.
- **Levels:** `LEVELS` in `src/game/levels.ts` sets each level's word length and enemy speed. Every other tunable, including timings, point values, fruit thresholds and lifetime, and the extra-life threshold, is in `src/game/config.ts`, along with the enemy definitions.
- **Maze:** `LEVEL_ONE_LAYOUT` in `src/game/mazeData.ts`, one string per row. Legend: `#` wall, `.` dot, `o` power pellet, a space for an empty corridor, `P` player start, `T` tunnel end (in matched pairs), `=` home door, `h` home interior, `E` enemy start slot. `createMaze` rejects an invalid layout at load: every corridor and dot must be reachable, tunnels must pair up, and the home must have exactly one door with a corridor outside it. Fruit appears on `P`. Enemy scatter corners and patrol waypoints in `config.ts` must name corridor tiles of the new layout. Then run `npm test` and `npm run test:e2e`, since several browser journeys steer by known tiles.
- **Icons:** edit and run `scripts/generate-icons.mjs`, then commit `public/icons/`. `public/manifest.webmanifest` lists the icons. Adding or removing a file in `public/` needs no worker change, because the build discovers every file to cache.

## Known limitations

- Pacing targets (about 1–3 minutes per level, a first catch within 10–25 seconds) and the 60 fps target are design goals, not measurements. The recorded human playtests were removed from scope by owner decision D024, and enemy speeds are the initial configured values.
- Device installation and offline checks rest on the project owner's report that M5 device validation completed with no notes. Exact devices and browser versions were not recorded. The automated suites run in headless Chromium, with mobile as 360 × 640 and 640 × 360 emulation. They exercise the real production service worker, but they do not replace a phone.
- Reduced motion is tested by emulating the media query and sampling canvas pixels, not with the setting turned on in a real OS.
- The maze cannot be navigated without sight.
- The first visit must be online; a stale cache may need the recovery steps above.
- Audio, music, sound effects and mute controls are excluded from the project (D016). Also out of scope: multiplayer, accounts, leaderboards, saved runs, extra mazes and endless play.

## Credits and license

The game design and all artwork are original to this project. The maze, player, ball, enemies and fruit are drawn at runtime with Canvas 2D shapes, and the app icons are generated by `scripts/generate-icons.mjs` from the same shapes. The interface uses the system font stack; no third-party images, fonts or sounds are included. The maze-chase genre is inspired by classic arcade games, but no original arcade assets, layouts or names are used.

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE).
