# Decision log

Use this file for durable decisions and rationale. Reference the PRD instead of reproducing its rules. New entries should include date, status, decision, rationale, source/authority, and affected documents. Preserve superseded entries and link replacements.

## D001 — Product baseline v1.0

- Date: 2026-09-16.
- Status: accepted by project owner.
- Decision: `PRD.md` v1.0 is the implementation baseline, including its scope, gameplay rules, architecture, milestones, acceptance criteria, and estimates.
- Rationale: provides a bounded three-day project and a consistent basis for implementation and review.
- Authority: project owner stated, “Baseline is good, the proposal can be finalized.”
- Affected documents: `PRD.md`, `README.md`.

## D002 — Claude implements; Codex coordinates and reviews

- Date: 2026-09-16.
- Status: accepted by project owner.
- Decision: Claude writes implementation and tests. Codex handles planning, coordination, verification, and code review; implementation fixes return to Claude.
- Rationale: separates implementation from review while keeping both grounded in shared repository context.
- Authority: explicit project owner instruction assigning these roles.
- Affected documents: `AGENTS.md`, `CLAUDE.md`, `PRD.md`, `README.md`.

## D003 — PRD estimates are authoritative

- Date: 2026-09-16.
- Status: accepted by project owner.
- Decision: use PRD section 9 for estimates; README summarizes the same figures. Retain the accepted budget and record actual usage separately for each agent.
- Rationale: eliminates contradictory estimates and prevents double-counting overlapping work.
- Authority: project owner stated, “The README estimate is wrong, the PRD is correct. Reconcile estimates.”
- Affected documents: `PRD.md`, `README.md`, `STATUS.md`.

## D004 — Shared repository handoffs

- Date: 2026-09-16.
- Status: adopted workflow for the owner's request to create shared workflow files.
- Decision: shared instructions live in `AGENTS.md`; current progress lives in `STATUS.md`; each implementation milestone gets a brief, evidence, and review history under `handoffs/`. Alternate checkout ownership and review identified commits.
- Rationale: agents can recover context without access to each other's conversation history, and reviews cannot be mistaken for acceptance of a different revision.
- Authority: Codex workflow choice within the owner's request; this does not authorize autonomous dispatch, publishing, or additional agents.
- Affected documents: `AGENTS.md`, `CLAUDE.md`, `STATUS.md`, `handoffs/TEMPLATE.md`.

## D005 — Wireframe layout reference

- Date: 2026-09-16.
- Status: planning layout selected by Codex within the accepted scope; final styling remains implementation work.
- Decision: mobile uses a stacked HUD/maze/pad with an overlaid guessing panel; desktop uses maze plus a word/control sidebar. A six-column alphabetical letter grid preserves minimum touch target sizes at the mobile reference width.
- Rationale: keeps Chase controls visible and gives Guessing sufficient space without invoking a native keyboard.
- Authority: Codex layout choice for the owner's request to add wireframes; no gameplay or budget change.
- Affected documents: `WIREFRAMES.md`, `docs/wireframes/`, `PRD.md`, `README.md`, `STATUS.md`.

## D006 — M0 complete; M1 ready for implementation

- Date: 2026-09-17.
- Status: coordination checkpoint recorded by Codex.
- Decision: close M0's planning deliverables and hand M1 to Claude using `handoffs/M1.md`. M1 covers the playable maze foundation only; later gameplay systems retain their PRD milestones. A visible directional pad is the initial touch input path.
- Rationale: gives Claude a bounded, testable increment and prevents full-game wireframes from expanding M1. Wireframe descriptions satisfy the planning deliverable; rendered appearance was unverified at this checkpoint (subsequently verified in D007). Runtime layout inspection is required during implementation.
- Authority: owner's instruction to move on to Claude's M1 brief; Codex coordinates milestones under the agreed role split. This checkpoint does not claim that Claude has been launched or that implementation is accepted.
- Affected documents: `handoffs/M1.md`, `STATUS.md`, `PRD.md`, `README.md`.

## D007 — Wireframes visually verified

- Date: 2026-09-17.
- Status: verified and accepted by the project owner.
- Decision: wireframe visual review is complete. Use the existing layouts as the implementation reference.
- Rationale: the project owner inspected the wireframes and confirmed they are OK; the previous inspection caveat is resolved.
- Authority: project owner stated, “I have verified the wireframes visually, they are OK.”
- Scope: approval covers the planning wireframes, not runtime layout, accessibility, or real-device checks on the future application.
- Affected documents: `WIREFRAMES.md`, `STATUS.md`, `handoffs/M1.md`.

## D008 — M1 implementation choices

- Date: 2026-09-17.
- Status: implementation choices made by Claude within the accepted M1 scope; no PRD, scope, or budget change.
- Decision:
  - Toolchain pinned with exact versions in `package.json` and `package-lock.json`: TypeScript 7.0.2, Vite 8.3.0, Vitest 5.0.1, Playwright 1.63.0, verified on Node 26.7.0.
  - Maze tiles are authored as a character layout validated at load: structure, spawn, matched tunnel endpoints, walkable borders, and reachability of every corridor and dot from the spawn. An invalid layout throws instead of producing a broken level.
  - Actor coordinates are continuous tile units with modular horizontal wrapping, so a tunnel crossing costs the same distance as any other tile and positions always stay inside the grid. The renderer draws the player on both sides of the seam.
  - Movement advances in sub-steps bounded by the next tile centre, so no movement distance, however large, can cross a wall. Simulation runs at a fixed 120 Hz with catch-up bounded to 12 steps per frame.
  - The page exposes a read-only `window.__hacman.getSnapshot()` readout for browser assertions. It cannot mutate state; browser tests drive gameplay through real controls.
  - The simulation does not advance while the page is hidden, and queued input is dropped on focus loss. The full PAUSED state and resume countdown remain M3 work.
- Rationale: keeps the simulation deterministic and testable without a DOM, prevents invalid level data from reaching players, and satisfies M1's fixed-step and input-cleanup requirements without building M3 systems early.
- Authority: Claude's implementation choices under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews); subject to Codex review.
- Affected documents: `README.md`, `handoffs/M1.md`.

## D009 — M1 review round 1 fixes: viewport-owned shell and a narrowed Node range

- Date: 2026-09-17.
- Status: implementation choices made by Claude to resolve Codex review findings R1 and R2; no PRD, scope, or budget change.
- Decision:
  - The application shell occupies exactly the viewport box (`#app { height: 100dvh }`, with a `100vh` fallback) instead of only a minimum height, and the stage may shrink on both axes. The canvas is sized from the stage, so the stage must never be sized by the canvas; a minimum height only let the layout keep the canvas it already had when the window got shorter.
  - Supported Node versions are declared as the intersection of the pinned toolchain's own ranges, `^22.12.0 || ^24.0.0 || >=26.0.0`, rather than a wider promise the tools cannot keep. Vitest 5 is the narrowest constraint.
  - `.npmrc` sets `engine-strict=true`, so an unsupported runtime is rejected at `npm ci` with a clear message instead of failing later inside a tool.
- Rationale: R1 was a layout feedback loop, not a sizing arithmetic error, so the fix belongs in the CSS that bounds the stage rather than in renderer clamping, and it needs no clipping or hidden overflow. R2 was an unkeepable promise; narrowing and enforcing it is honest and fails fast. This refines D008's runtime statement, which recorded only Node 26.7.0.
- Authority: Claude's implementation fixes under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews); subject to Codex re-review.
- Affected documents: `README.md`, `package.json`, `.npmrc`, `src/styles.css`, `e2e/layout.spec.ts`, `handoffs/M1.md`.

## D010 — M2 single-round implementation boundary

- Date: 2026-09-17.
- Status: milestone planning choice by Codex within PRD v1.0.
- Decision: M2 implements a complete single-word round, a small categorized seed list, letter/word scoring, and replay/title actions on completion. Full campaign progression and the 50-word bank remain M4. Start with a configurable two-second wrong-guess countdown. Include M1's nonblocking R3 lockfile metadata cleanup.
- Rationale: makes the defining chase/guess loop playable and testable without pulling campaign or enemy systems into M2. Correct and wrong guesses, frozen state, input transitions and one-time completion each have explicit acceptance evidence.
- Authority: owner's request to prepare M2's brief and Codex's agreed planning role; no product scope or budget change.
- Affected documents: `handoffs/M2.md`, `STATUS.md`, `README.md`, `PRD.md`.

## D011 — M2 implementation choices

- Date: 2026-09-17.
- Status: implementation choices made by Claude within the accepted M2 scope; no PRD, scope, or budget change.
- Decision:
  - The ball is an ordinary actor driven by a policy instead of queued input, through one shared movement engine (`advanceActor` with an optional direction chooser). Its policy, applied at every tile centre, is a uniform random choice among the legal exits excluding an immediate reversal, falling back to the reversal only at a dead end. It therefore rolls straight through corridors, may turn at junctions, uses the tunnel, and never stops.
  - Ball spawns are chosen from a breadth-first distance map over the same traversal rules, so a tunnel crossing costs one tile. The graph anchor is the tile centre the player is nearest to; both endpoints of a partly crossed segment are excluded. Tiles at least six tiles away are chosen uniformly; otherwise the farthest reachable tile is, with ties randomized. A fixture with no eligible tile returns no spawn and leaves the round without a ball rather than looping or overlapping the player.
  - Capture is a centre-to-centre distance of half a tile, tested after movement substeps bounded to a quarter tile, so an arbitrarily long frame cannot let the actors pass through one another. The seam is measured the short way round only when both actors are on a tunnel row, so opposite ends of an ordinary row are correctly far apart.
  - States are extended with `guess`, `resuming` and `level-complete`. Every transition runs through one private method guarded by its source state, so repeated clicks, key repeat or repeated update calls cannot open guessing twice, respawn a second ball, or award the word bonus again. The countdown treats a sub-nanosecond rounding residue as elapsed, so a whole number of steps ends it exactly.
  - Animation is driven by the game's own accumulated active time rather than a wall clock, so a frozen maze is genuinely still even though render frames keep arriving.
  - Input ownership is decided per state: chase owns movement keys and the pad, guessing owns letter keys and the letter grid. Ownership is resolved before the auto-repeat check, so a held arrow key still suppresses page scrolling while only the first press is applied. Letters are activated on `click` only, so one tap cannot guess twice.
  - Word state lives in the header in every mode, which lets the mobile guessing panel cover the play area without hiding the category, the mask, the misses, or the live feedback.
  - Randomness, word selection and ball placement are injected. Browser tests configure a round through three start-up query parameters (`testSeed`, `testWord`, `testBall=off`) that choose only what a round starts with; they mutate no state and reveal no answer, and the complete-loop journey uses the real spawn and capture code while chasing with the game's own controls. [D012](#d012--m2-review-round-1-fixes) restricts these parameters to a test-only build.
- Rationale: one movement engine and one transition authority keep the ball honest against the same maze rules as the player and make duplicate events harmless. Bounded substeps and an explicit capture radius make contact independent of frame rate. Injecting the three sources of variation is what makes a whole round reproducible in tests without a production control that could be used to cheat.
- Authority: Claude's implementation choices under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews); subject to Codex review.
- Affected documents: `README.md`, `handoffs/M2.md`.

## D012 — M2 review round 1 fixes

- Date: 2026-09-17.
- Status: implementation choices made by Claude in response to Codex findings M2-R1 and M2-R2; no PRD, scope, or budget change.
- Decision:
  - Frame timing moves out of the shell into `src/app/frameTiming.ts`. A suspension — window blur, or either direction of a visibility change — now discards the frame timestamp as well as the loop's buffered time, so the first frame after an absence reports no elapsed time. Hidden time therefore never reaches the simulation at all, rather than being clamped to the loop's catch-up bound of twelve steps. Because the class holds the policy and the shell only wires DOM events to it, the rules are covered by ordinary Vitest tests against a real `Game` and a real `FixedStepLoop`.
  - The deterministic start-up parameters are compiled out of ordinary output. `vite.config.ts` defines the build-time constant `__TEST_FIXTURES__`, true only under `vite build --mode fixture` (`npm run build:fixture`, written to `dist-fixture/`), and the shell reads the query string only in that branch. The browser suite serves both builds: the `desktop` and `mobile` projects use the test-only build, and a `production` project plays an unparameterized round against the ordinary production build and asserts that the parameters cannot disable the ball or pin the word and that their names are absent from the served bundle.
- Rationale: a countdown with less than the catch-up bound remaining could otherwise be finished by the act of returning to the tab, which is a real gameplay effect rather than a rounding detail. Keeping the fixtures in a separate build makes the test/production boundary a property of the build rather than a claim in prose, and keeps the deterministic browser journeys intact. Extracting the timing policy is what makes the hidden-page behavior testable without adding a DOM test environment.
- Authority: Claude's implementation choices under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews), resolving review findings recorded in `handoffs/M2.md`; subject to Codex recheck.
- Affected documents: `README.md`, `handoffs/M2.md`, `STATUS.md`.

## D013 — M3 one-level arcade implementation contract

- Date: 2026-09-17.
- Status: milestone planning choices by Codex within accepted PRD v1.0; tunable defaults, not owner-approved scope changes.
- Decision: M3 adds four distinct enemy policies, explicit home traversal permissions and release/return lifecycle, pellets/frightened scoring, ordered collisions, three lives and death/restart, and pause retaining any active state's remaining timers. The single-word round remains; campaign, fruit, extra life, persistence and sound stay M4. `handoffs/M3.md` specifies initial phase/speed/release/death values and collision/timer interactions so tests share one contract. Full focus-loss pause now replaces M2's temporary input-clear/frame-rebase handling; returning requires explicit Resume.
- Rationale: makes a complete win/loss game while preventing enemy timers and collisions from breaking the defining chase/guess loop. Pellet/enemy scoring is needed with those features rather than postponed to campaign scoring. Existing fixture isolation and a real production smoke remain mandatory.
- Authority: owner's request to prepare Claude's M3 implementation brief; Codex's planning role under D002. No scope or accepted budget change.
- Affected documents: `handoffs/M3.md`, `STATUS.md`, `README.md`, `PRD.md`.
