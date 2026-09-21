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

## D014 — M3 implementation choices

- Date: 2026-09-17.
- Status: implementation choices made by Claude within the accepted M3 scope ([D013](#d013--m3-one-level-arcade-implementation-contract)); no PRD, scope, or budget change.
- Decision:
  - **Traversal is a permission, not an actor flag.** `neighbor` and `advanceActor` take a `Traversal`: `maze` is the shared player, ball and roaming-enemy graph, and `home` is that graph plus the enemy door and interior. Only an enemy in its `exiting` or `returning` state asks for `home`, and because `home` is a superset, a state change part-way through a move can never make an illegal move legal. Widening enemy movement therefore cannot widen the player's or the ball's.
  - **The home is authored and validated.** `LEVEL_ONE_LAYOUT` gains four `E` start slots around the tile below the existing door. The loader derives the door, the single corridor outside it and the single home tile inside it, and rejects a layout whose door touches more than one corridor, whose home has no start slot, or whose slots cannot reach the door. `Game` additionally rejects more enemies than slots, an unreachable scatter corner or patrol waypoint, and a patroller with no circuit. A maze that authors no home carries no enemies at all, which is what the small M1/M2 fixtures rely on.
  - **Enemies are five-state actors on the shared movement engine.** `home`, `exiting`, `roaming`, `returning` and `resting`; only `roaming` can touch the player, so a waiting, leaving or returning enemy is neither lethal nor edible. Turns are chosen at tile centres from breadth-first path distances over the appropriate graph, memoized per target in `src/game/paths.ts` so four enemies sharing a target search once. Ties resolve in a fixed up, left, down, right order. Reversal is refused except at a dead end or on an explicitly documented mode change — a chase/scatter flip, the start of a frightened effect, or being eaten — which is requested as a flag and consumed at the next tile centre, so a reversal can never cut through a wall.
  - **Timers run first in each simulation slice**, then legal movement for every actor, then collectibles reached, then enemy contacts, then ball capture. So a pellet reached on a slice protects before the contact on that slice, and the slice in which frightened time reaches zero already treats the enemies as lethal. Whether a slice is lethal is decided across all touching enemies before any eat is awarded, several lethal contacts cost one life, and a death ends the slice. Slices are bounded by the fastest actor in the game, an enemy returning at 125% of player speed, rather than by the player.
  - **PAUSED retains the state it interrupted** and refuses a second pause, so repeated blur and visibility events cannot overwrite it. Escape and the Pause button only ever open the overlay; resuming is a separate action on a real button, which is what stops the press that paused from also resuming. Losing window focus or the page becoming hidden pauses as well, and returning rebases the frame clock without resuming. This replaces M2's input-clear/frame-rebase handling and corrects its overly broad "unfocused" claim.
  - **Deterministic browser fixtures gain `testEnemies=off`**, in the gated test-only build, so the inherited M1/M2 journeys keep asserting movement, layout and the guessing loop rather than survival. Every M3 journey in `e2e/arcade.spec.ts`, and the production smoke, run against the real four enemies with the game's own controls; the automated chaser avoids enemies the way a player would, which is evidence that the paths work, not that the pacing feels right.
- Rationale: making the graph permission explicit is what keeps the player's maze exactly as M1 and M2 shipped while enemies gain a door to cross. Deciding lethality before scoring, and bounding slices by the fastest actor, are what make the collision contract hold at any frame rate. Retaining the paused state rather than a boolean is what lets a pause in guessing resume into guessing, and separating pause from resume removes a whole class of one-press-does-both bugs.
- Authority: Claude's implementation choices under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews); subject to Codex review.
- Affected documents: `README.md`, `handoffs/M3.md`.

## D015 — Owner-approved M3 visual feedback amendment

- Date: 2026-09-17.
- Status: accepted by project owner; supersedes the removal requested in M3-R1.
- Decision: retain the current frightened-enemy expiry flash as a specific exception to PRD section 5's no-flashing rule. Close M3-R1 by owner approval, not by claiming a code fix. Add a smooth full-spectrum ball fill hue cycle, one revolution per two seconds, to M3; retain the contrasting ring. Use active maze time so the hue freezes with the maze in guessing, countdown, death, pause and result states, with no background catch-up.
- Rationale: the owner reports user testing found the enemy effect mild and beneficial, and requests greater ball visibility on a busy screen. This feedback supports the specific effect; it does not establish completion of broader pacing or real-device release checks.
- Authority: owner's explicit instruction to allow the P2 effect and add the two-second ball hue cycle in M3. Claude still implements; Codex plans and reviews. No revision to the accepted time/token budget was requested.
- Affected documents: `PRD.md`, `handoffs/M3.md`, `STATUS.md`. Claude updates implementation documentation with the delivered behavior.

## D016 — Audio removed from the project

- Date: 2026-09-21.
- Status: accepted by project owner; supersedes earlier audio/mute requirements and deferrals in D013, historical handoffs and wireframes.
- Decision: remove all audio, music, sound effects, mute controls, audio preferences, audio assets and audio-specific offline/tests requirements from the project, including M4. Keep visual feedback and the D015 visual amendment. Preserve historical implementation/review records as history rather than rewriting them.
- Rationale/authority: owner explicitly stated that audio will not be part of this project and requested an M4 brief on that basis.
- Budget: retain existing PRD estimates as planning allowances; do not invent a savings figure or silently redistribute scope. Record actual time/usage separately.
- Affected documents: `PRD.md`, `README.md`, `WIREFRAMES.md`, `docs/wireframes/`, `STATUS.md`, `handoffs/M4.md`.

## D017 — M4 campaign and scoring boundaries

- Date: 2026-09-21.
- Status: Codex planning choices within the accepted PRD, incorporating D016.
- Decision: M4 delivers five levels with 4/5/6/7/8-letter categorized words, at least ten curated entries per length; a run-specific used-word set; conservative configured enemy-speed progression; fruit at 30%/70% of original normal dots with one pending spawn if necessary; centralized score awards granting one extra life at 10,000; resilient local high-score storage. Specify death, level and terminal-state reset behavior in the M4 brief. No new preference control is required solely to replace mute; preference persistence is added when a real setting exists.
- Rationale: makes campaign completion, score edges and cross-level state testable without adding a backend, audio, or unfinished settings. Audio removal does not defer any remaining M4 requirement.
- Authority: owner's request for M4's implementation brief, under Codex's planning role. Defaults may be tuned with recorded evidence; product scope and accepted budget remain authoritative.
- Affected documents: `handoffs/M4.md`, `STATUS.md`.
