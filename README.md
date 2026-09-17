# Hac-Man

A mobile and desktop progressive web app, in development, that combines maze-chase arcade action with a word-guessing game.

Catch a moving ball to enter Guessing mode. Reveal letters to solve the level's word; an incorrect guess sends you back into the maze to catch the ball again. Dots, four enemies, power pellets, and bonus items keep each chase active.

## Project status

Product baseline v1.0 accepted on 2026-09-16. M0 planning is complete. M1 (playable maze) was accepted by Codex on 2026-09-17 after review and independent verification. Later milestones add enemies, the campaign, and PWA behavior. See [STATUS.md](STATUS.md) for the next action and nonblocking follow-ups.

Claude handles implementation and tests; Codex handles planning, coordination, verification, and code review.

M2 (the defining chase/guess loop) is accepted at `0be0b439`; see [its handoff](handoffs/M2.md) for verification. M3 (arcade danger: four enemies, power pellets, lives, death, restart and pause) is implemented and awaiting Codex's review; see [its handoff](handoffs/M3.md).

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
| `npm run test:e2e` | Playwright browser journeys; builds and previews both builds automatically. |
| `npm run build` | Type-check the application and write the production build to `dist/`. |
| `npm run preview` | Serve the production build on <http://127.0.0.1:4173>. |
| `npm run build:fixture` | Test-only build with the deterministic start-up parameters, written to `dist-fixture/`. |
| `npm run preview:fixture` | Serve the test-only build; the browser suite uses <http://127.0.0.1:4174>. |

## What works today (M1 and M2 accepted; M3 in review)

A complete one-level game with both a win and a loss path: start with three lives, chase the ball while four enemies chase you, catch it, guess letters, miss and chase again, eat a power pellet and turn the tables, lose lives, and either solve the word or run out of lives and restart.

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
- A fixed 120 Hz simulation with bounded catch-up, independent of the render cadence; neither the maze nor any timer advances while the game is paused or the page is hidden.
- Four enemies with their own identity, colour and shape marker: Chaser goes straight for you, Ambusher aims up to four legal steps ahead of where you are heading, Patroller walks a fixed circuit and ignores you, and Prowler pursues from eight or more path tiles away and retreats to its corner when it gets closer. Each decides at tile centres using real path distances, never doubles back except at a dead end or on a documented mode change, and roams at 75% of your speed.
- Repeating phases of 7 seconds scattering to four corners and 20 seconds chasing. Enemies leave home 0, 2, 4 and 6 active chase seconds into a life, and turn round once when the phase flips.
- An enemy home only enemies can cross. The player and the ball are refused its door and interior by the traversal rules themselves, and the layout is validated at load: one door, one corridor outside it, one waiting tile inside it, and a legal route from every start slot.
- Four power pellets on the outer corridors, in place of the dots that were there. One scores 50 and frightens every roaming enemy for six active chase seconds: they slow to 50%, turn blue, move at random and can be eaten for 200, 400, 800 then 1,600 points, capped at 1,600 for the rest of that effect. A second pellet refreshes the six seconds rather than adding to them and restarts the chain, and the chase/scatter clock is frozen for the duration and resumes with the time it had left.
- An eaten enemy is harmless at once, travels home by a legal path at 125% of your speed, waits a second inside the door and then leaves again, inheriting a frightened effect that is still running.
- Three lives. A lethal touch costs exactly one, however many enemies are involved, and opens a 750 ms death presentation in which only that timer advances. With a life left, the actors return to their starts, the ball respawns by the usual distance rule, the enemy timers and the score chain reset, and you get two active seconds of protection that ignores lethal contacts but not collection, ball capture or eating a frightened enemy. Score, word, guesses, dots and pellets all survive. A wrong letter still costs no life.
- At zero lives the run freezes, the word is revealed, and Restart run or Title screen are the only ways on. Restart and Play again both start a completely fresh three-life run.
- Each simulation slice resolves in the PRD's order: legal movement, then collectibles reached, then enemy contacts, then ball capture. A pellet reached on the same slice protects before the contact; a lethal contact beats a simultaneous ball capture; the slice ends at a death. Slices are bounded by the fastest actor in the game, which is an enemy on its way home.
- A Pause button and Escape pause the chase, guessing, the countdown and the death presentation, and so do losing window focus or the page becoming hidden — including a window that stays visible while frames keep arriving. The pause overlay owns focus, disables everything under it, and offers Resume, Restart run and Title screen. Only Resume restores play, with every timer exactly where it was; returning to the tab never resumes by itself, and repeated blur or visibility events cannot overwrite the state being held. Escape only ever opens the overlay, so the press that paused cannot also resume.
- Lives, the current mode, protection and the death message are shown in words as well as drawn, and the pause, death and game-over surfaces keep the 44 × 44 px targets and the focus behaviour at 360 × 640 and on desktop.

## Architecture

The simulation is independent of the browser. `src/game/` holds the tile map and its validation, the actor movement rules, the ball policy and contact test, the enemy state machine and targeting policies, the shared breadth-first path helpers, ball spawn selection, word rules, seeded randomness, the game state, and the fixed-step loop; nothing there touches canvas, DOM, or timers, so tests step it directly. `src/input/` routes keys, pad presses and letter buttons to the mode that owns them, `src/render/` draws the maze on a canvas, and `src/app/` wires DOM events, resizing, focus, and the animation frame. `tests/` holds Vitest suites and `e2e/` the Playwright journeys.

Player, ball and enemies share one movement engine: the ball and the enemies are ordinary actors steered by a policy at each tile centre rather than by queued input, so all three obey the same walls, corridors and tunnel rules. Every state change runs through one private transition in `Game`, so a repeated event cannot open guessing twice, respawn two balls, take two lives for one death, or award the word bonus again.

What an actor may walk on is a traversal permission passed to the movement engine, not a flag on the actor. `maze` is the shared player, ball and roaming-enemy graph; `home` is that graph plus the enemy door and interior, and only an enemy in its exiting or returning state ever asks for it. Widening enemy movement therefore cannot widen the player's. Enemy turns come from breadth-first path distances over the appropriate graph, memoized per target in `src/game/paths.ts` so four enemies sharing a target search once, and taken only at tile centres rather than on render frames. Ties resolve in a fixed up, left, down, right order, so a fixture replays exactly.

The page exposes a read-only `window.__hacman.getSnapshot()` readout for browser assertions. It cannot change game state, and it masks the unsolved word, so a test cannot read the answer out of it; browser tests drive the game through real controls.

Randomness, word selection and ball placement are injected, so a test can replay an entire round. The browser tests use four query parameters read once at start-up (`src/app/fixture.ts`): `testSeed=<integer>` seeds the round, `testWord=<index>` pins the word to an entry of the seed list, `testBall=off` runs the maze with no ball, and `testEnemies=off` runs it with no enemies, so the inherited movement, layout and guessing journeys cannot be interrupted by a legitimate capture or death. They configure what a round starts with and nothing else: no game state is mutated, no answer is revealed, and the complete-loop journey uses the real spawn rule and the real capture algorithm while chasing the ball with the game's own controls.

Those parameters take effect only in the test-only build. `vite.config.ts` compiles the build-time constant `__TEST_FIXTURES__` to `true` only for `npm run build:fixture`; it is `false` for `npm run dev`, `npm run build` and the Vitest run, which never read the query string. The production build also tree-shakes the dead branch, so an ordinary bundle contains none of the four parameter names, and a visit to `/?testBall=off` plays an ordinary round in the dev server and in production alike. The browser suite therefore serves two builds. The `desktop` and `mobile` projects run against the test-only build on port 4174; the `production` project runs `e2e/production.spec.ts` against the ordinary production build on port 4173, where it plays an unparameterized round against the real four enemies and asserts that the parameters neither disable the ball nor pin the word. Frame timing is separated from the DOM in `src/app/frameTiming.ts`, so the hidden-page rules are covered by `tests/frameTiming.test.ts` rather than only by a browser.

## Known limitations

- Bonus fruit, the extra life at a score threshold, sound and mute, the five-level campaign, stored high scores and preferences, and PWA install/offline support are not implemented yet; they belong to M4 and M5. The pause menu has no mute control, because there is no audio to mute.
- The game delivers one word at a time. Play again starts a fresh level one and may pick the same word; campaign progression and the no-repeat 50-word bank are M4.
- Enemy speeds, phase lengths, release offsets and the death and protection durations are the starting values from the M3 brief. They are in `src/game/config.ts` and have not been tuned against a human playtest; pacing work belongs to M4.
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
