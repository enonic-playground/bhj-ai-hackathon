# Hac-Man

A mobile and desktop progressive web app, in development, that combines maze-chase arcade action with a word-guessing game.

Catch a moving ball to enter Guessing mode. Reveal letters to solve the level's word; an incorrect guess sends you back into the maze to catch the ball again. Dots, ghosts, power pellets, and bonus items keep each chase active.

## Project status

Product baseline v1.0 accepted on 2026-09-16. M0 planning is complete. M1 (playable maze) was accepted by Codex on 2026-09-17 after review and independent verification. Later milestones add enemies, the campaign, and PWA behavior. See [STATUS.md](STATUS.md) for the next action and nonblocking follow-ups.

Claude handles implementation and tests; Codex handles planning, coordination, verification, and code review.

M2 (the defining chase/guess loop) is implemented and awaiting Codex's review; see [its handoff](handoffs/M2.md) for the evidence. Nothing in M2 is accepted until that review concludes.

Both agents follow [AGENTS.md](AGENTS.md) and resume from [STATUS.md](STATUS.md). Durable decisions live in [DECISIONS.md](DECISIONS.md); milestone briefs and review evidence use the [handoff template](handoffs/TEMPLATE.md). [CLAUDE.md](CLAUDE.md) points Claude to the shared instructions.

See [PRD.md](PRD.md) for game rules, scope, architecture, milestone acceptance criteria, tests, and estimates, and [WIREFRAMES.md](WIREFRAMES.md) for the layout references.

## Requirements

- Node.js `^22.12.0 || ^24.0.0 || >=26.0.0`. This is the range all pinned tools support; the narrowest constraint is Vitest 5. Node 20, 21, 23, and 25 are not supported, and `.npmrc` sets `engine-strict=true` so `npm ci` rejects them instead of failing later inside a tool.
- Verified on Node 22.12.0 (npm 10.9.0), 24.13.0, and 26.7.0 (npm 11.19.0), all on macOS arm64.
- A Chromium download for the browser tests: `npx playwright install chromium`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install pinned dependencies from the committed lockfile. |
| `npm run dev` | Development server on <http://127.0.0.1:5173>. |
| `npm run typecheck` | TypeScript checking without emitting output. |
| `npm test` | Unit, simulation, and input tests (Vitest, single run). |
| `npm run test:e2e` | Playwright browser journeys; builds and previews the app automatically. |
| `npm run build` | Type-check the application and write the production build to `dist/`. |
| `npm run preview` | Serve the production build on <http://127.0.0.1:4173>. |

## What works today (M1 and M2, pending review)

A complete single word round: start, chase the ball, catch it, guess letters, miss and chase again, solve the word, and replay.

- Title screen with instructions and a Start action that opens a fresh round.
- One authored 21 × 23 maze, validated for tile types, spawn, matched tunnel endpoints, and reachability of every corridor and dot.
- Continuous cardinal movement with buffered turns, wall stops, corridor reversal, and side-tunnel wraparound.
- Dots score 10 points once each; clearing them never ends a round, which is solved by completing the word.
- One rolling ball at 80% of the player's speed. It follows the same corridors and tunnels as the player, takes a random legal turn at each tile centre without doubling back, reverses at dead ends, enters neither walls nor the enemy home, and collects nothing.
- Ball spawns are at least six legal tiles from the player, measured along maze edges including the tunnel, and never on the tile or the segment the player occupies. If nothing is that far away, the farthest reachable tile is used.
- Catching the ball freezes the maze, the actors, the collectibles and every timer, then opens an accessible A–Z letter panel. Capture is tested after bounded movement substeps, so a slow frame cannot let the player and the ball pass through one another, and the side tunnel is measured the short way only on a tunnel row.
- A correct letter reveals every occurrence and scores 100 a position; guessing continues. A duplicate or a non-letter does nothing. A wrong letter is recorded without any penalty, places one new ball, and starts a two-second countdown in which only the countdown itself advances.
- Solving the word awards the 1,000-point bonus exactly once and shows the solved word, the bonus, and the total score, with Play again and Title screen actions.
- Words come from a small categorized seed list of 4–8 letter words, including repeated-letter words. The 50-word bank, campaign uniqueness, and difficulty progression are M4.
- Arrow keys, WASD, and the directional pad drive the chase; the letter keys and the letter grid drive guessing, so W/A/S/D spell guesses there instead of moving. Held keys, key repeat and stray pointer events cannot cross a mode boundary, and Ctrl, Meta and Alt shortcuts stay with the browser.
- Responsive shell that keeps the HUD, maze, and pad together at 360 × 640 CSS pixels and uses a side panel on wider viewports, with square tiles at every size. The maze refits when the window is resized in either direction, without a reload. All 26 letters stay at least 44 × 44 px at both sizes, with symbol as well as colour feedback, visible focus, and a live region for word and guess announcements.
- A fixed 120 Hz simulation with bounded catch-up, independent of the render cadence; neither the maze nor the countdown advances while the page is hidden.

## Architecture

The simulation is independent of the browser. `src/game/` holds the tile map and its validation, the actor movement rules, the ball policy and contact test, ball spawn selection, word rules, seeded randomness, the game state, and the fixed-step loop; nothing there touches canvas, DOM, or timers, so tests step it directly. `src/input/` routes keys, pad presses and letter buttons to the mode that owns them, `src/render/` draws the maze on a canvas, and `src/app/` wires DOM events, resizing, focus, and the animation frame. `tests/` holds Vitest suites and `e2e/` the Playwright journeys.

Player and ball share one movement engine: the ball is an ordinary actor steered by a policy at each tile centre rather than by queued input, so both obey the same walls, corridors and tunnel rules. Every state change runs through one private transition in `Game`, so a repeated event cannot open guessing twice, respawn two balls, or award the word bonus again.

The page exposes a read-only `window.__hacman.getSnapshot()` readout for browser assertions. It cannot change game state, and it masks the unsolved word, so a test cannot read the answer out of it; browser tests drive the game through real controls.

Randomness, word selection and ball placement are injected, so a test can replay an entire round. The browser tests use three query parameters read once at start-up (`src/app/fixture.ts`): `testSeed=<integer>` seeds the round, `testWord=<index>` pins the word to an entry of the seed list, and `testBall=off` runs the maze with no ball so the movement and layout journeys cannot be interrupted by a legitimate capture. They configure what a round starts with and nothing else: no game state is mutated, no answer is revealed, and the complete-loop journey uses the real spawn rule and the real capture algorithm while chasing the ball with the game's own controls.

## Known limitations

- Enemies, lives, power pellets, fruit, sound, the five-level campaign, high scores, and PWA install/offline support are not implemented yet; they belong to M3–M5.
- M2 delivers one round at a time. Play again starts a fresh level one and may pick the same word; campaign progression and the no-repeat 50-word bank are M4.
- There is no pause interface. Input is dropped and the simulation stops while the page is hidden or unfocused, but the explicit PAUSED state, the pause menu and an explicit resume on return arrive in M3.
- Mobile behavior is verified with browser emulation at 360 × 640 only. Real-device touch, installation, and offline checks are M5 work.
- No service worker, manifest, icons, or audio yet.

## Three-day delivery target

| Day | Outcome | Focused time before contingency |
| --- | --- | ---: |
| 1 | Product definition, rules, scope, and milestones | 3–4 hours |
| 2 | Playable maze, guessing loop, and core arcade mechanics | 6.5–8 hours |
| 3 | Campaign, mobile/PWA completion, polish, testing, and documentation | 5–6.5 hours |

Base estimate: **16.5–20.5 focused hours**, including **8–11 hours of active Codex sessions**, across **9–10 sessions**, and **1.00–2.45 million cumulative model tokens**.

Budget including contingency: **18.5–24 focused hours**, including **9–13 hours of active Codex sessions**, and **1.2–3.0 million cumulative model tokens**. Allow 1–2 additional repair sessions if needed. Active session time is included in focused work, not added to it.

Tokens include cumulative input and output across model calls, repeated/cached context, and reported reasoning output where available. These are planning allowances, not measured usage or guarantees. [PRD section 9](PRD.md#9-session-and-token-estimates) is the source of truth for estimates and assumptions.

Installation, offline, and release instructions are added as the corresponding milestones complete; the final setup guide is a Day 3 deliverable.
