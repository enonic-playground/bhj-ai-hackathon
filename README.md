# Hac-Man

A mobile and desktop progressive web app, in development, that combines maze-chase arcade action with a word-guessing game.

Catch a moving ball to enter Guessing mode. Reveal letters to solve the level's word; an incorrect guess sends you back into the maze to catch the ball again. Dots, ghosts, power pellets, and bonus items keep each chase active.

## Project status

Product baseline v1.0 accepted on 2026-09-16. M0 planning is complete. M1 (playable maze) is implemented and awaiting review: the application runs, and the commands below are established and verified. Later milestones add the ball, guessing, enemies, campaign, and PWA behavior.

Claude handles implementation and tests; Codex handles planning, coordination, verification, and code review.

Both agents follow [AGENTS.md](AGENTS.md) and resume from [STATUS.md](STATUS.md). Durable decisions live in [DECISIONS.md](DECISIONS.md); milestone briefs and review evidence use the [handoff template](handoffs/TEMPLATE.md). [CLAUDE.md](CLAUDE.md) points Claude to the shared instructions.

See [PRD.md](PRD.md) for game rules, scope, architecture, milestone acceptance criteria, tests, and estimates, and [WIREFRAMES.md](WIREFRAMES.md) for the layout references.

## Requirements

- Node.js 20.19 or newer; developed and verified on Node 26.7.0 with npm 11.19.0.
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

## What works today (M1)

- Title screen with instructions and a Start action that opens a fresh level-one maze.
- One authored 21 × 23 maze, validated for tile types, spawn, matched tunnel endpoints, and reachability of every corridor and dot.
- Continuous cardinal movement with buffered turns, wall stops, corridor reversal, and side-tunnel wraparound.
- Dots score 10 points once each; a cleared maze stays playable, since levels end by solving a word from M2 onwards.
- Arrow keys, WASD, and a visible directional pad, all driving the same movement rules. Handled movement keys suppress page scrolling only while a maze is in play.
- Responsive shell that keeps the HUD, maze, and pad together at 360 × 640 CSS pixels and uses a side panel on wider viewports, with square tiles at every size.
- A fixed 120 Hz simulation with bounded catch-up, independent of the render cadence; the maze does not advance while the page is hidden.

## Architecture

The simulation is independent of the browser. `src/game/` holds the tile map and its validation, the actor movement rules, the game state, and the fixed-step loop; nothing there touches canvas, DOM, or timers, so tests step it directly. `src/input/` maps keys and pad presses to game requests, `src/render/` draws the maze on a canvas, and `src/app/` wires DOM events, resizing, and the animation frame. `tests/` holds Vitest suites and `e2e/` the Playwright journeys.

The page exposes a read-only `window.__hacman.getSnapshot()` readout for browser assertions. It cannot change game state; browser tests drive the game through real controls.

## Known limitations

- Ball, word guessing, enemies, lives, fruit, sound, the five-level campaign, high scores, and PWA install/offline support are not implemented yet; they belong to M2–M5.
- There is no pause interface. Input is dropped and the simulation stops while the page is hidden or unfocused, but the explicit PAUSED state and resume countdown arrive in M3.
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
