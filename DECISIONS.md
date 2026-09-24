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

## D018 — M4 implementation choices

- Date: 2026-09-21.
- Status: implementation choices made by Claude within the accepted M4 scope ([D017](#d017--m4-campaign-and-scoring-boundaries)); no PRD, scope, or budget change.
- Decision:
  - **The word bank validates itself at load.** `src/game/words.ts`'s `validateWordBank` runs once against the 50-entry `WORD_BANK`, rejecting a case/trim-insensitive duplicate or fewer than ten entries for any of the campaign's five lengths, so a broken edit fails the build rather than surfacing later as a repeat or a stuck level. `selectWordForLevel` draws uniformly from the entries of the requested length that are not in the caller's excluded set, and throws — never loops or silently repeats — when that pool is empty. `Game` tracks a per-run `#usedWords` set of normalized words, passed as `excluded` on every selection and cleared only by `startLevel`, so a level transition can never repeat a word within a run even though, in practice, each of the five levels asks for a different length and so never collides with itself.
  - **Difficulty is an override, not a second config object to keep in sync.** `src/game/levels.ts`'s `LEVELS` fixes each level's word length and roaming `enemySpeedFactor`; `Game` computes `#effectiveConfig` as `config` with only `enemySpeedFactor` replaced, recomputed whenever `#resetLevelState` runs (a fresh run or `nextLevel`), and reads it wherever movement or the substep bound depends on enemy speed. Every other tunable — timings, radii, every score value — stays level-invariant in the one shared `config`, so a level transition cannot silently drift any value the brief did not ask it to change.
  - **`startLevel` and `nextLevel` share one reset, `#resetLevelState`, that never touches score, lives, the used-word set or the earned-extra-life flag.** Those four are reset only by `startLevel` (a fresh run) and are the only state `nextLevel` (guarded to fire only from `level-complete`, and only once) deliberately preserves across a transition. Solving level five's word skips `level-complete` and enters `campaign-complete` directly in `#completeRound`, so there is no level six and no second Next level action to guard.
  - **Fruit is one optional instance plus a pending flag, not a queue.** It always spawns on the maze's own spawn tile — the brief's suggested "current player-start tile" — since that tile is already validated reachable by the maze loader. Both dots-consumed thresholds are computed once, from the maze's fixed dot count, in the constructor. A threshold crossed with no fruit up spawns immediately in the same collect step; a threshold crossed while one is already up only sets a pending flag. Every substep first checks that pending flag, before timers and before movement, so a fruit freed by the *previous* substep's expiry or collection appears at the start of the *next* substep — never the same one — matching the brief's ordering without a separate queue data structure. Death clears an active or pending fruit but never the fired-threshold flags or the dots-consumed count, so a threshold already spent cannot be farmed by dying next to it.
  - **One private method owns every score award.** `#awardScore` is the only place `#score` changes; it grants the run's sole extra life the instant score first reaches `extraLifeScoreThreshold`, whichever of dots, pellets, a letter, the word bonus, an eaten enemy or fruit crossed it, and never again. Because collectibles are already resolved before enemy contacts in the existing per-slice order, an extra life earned by a collectible that happens to cross the threshold on a lethal-contact slice is granted before that slice's death takes a life, with no additional ordering code required.
  - **Best score lives outside the DOM-free simulation, on purpose.** `src/app/bestScore.ts`'s `BestScoreStore` takes an injectable `StorageLike` (just `getItem`/`setItem`), so its resilience — absent, malformed, negative, non-finite, wrong-version or write-denied data all read as no saved best, and a lower run score never overwrites a higher one — is unit-tested against a fake backend without touching `Game` or the DOM. `resolveLocalStorage` probes a real round trip (`setItem` then `removeItem`) before trusting `window.localStorage`, since a backend can exist but still throw. The shell records a score only when it actually changes, reads `best` once at title and at both end panels, and never restores a run: a reload always returns to the title screen.
  - **The fixture build gained `testWords=<i1>,<i2>,...`, alongside the unchanged `testWord=<index>`.** `testWord` still pins one `SEED_WORDS` entry for every level, exactly as the M2/M3 single-round journeys already relied on; `testWords` pins level 1, 2, 3… to entries in order (repeating the last for any level beyond the list), which is how `e2e/campaign.spec.ts`'s five-level journey knows each level's answer without the runtime snapshot ever revealing an unsolved one — the test chose the words through the query string, the same fixture-only allowance an already-known seed or fixed spawn uses elsewhere.
  - **A browser journey that targets a specific maze tile must decide only at a true tile centre.** Recomputing "best direction toward a fixed target" every polling tick from a `Math.round`-ed position is unreliable in the final half-tile of approach: rounding can snap to the destination tile before the player actually arrives, which reads as "already there, so leave again" and reverses the player indefinitely at the tile boundary. `e2e/campaign.spec.ts`'s dot-sweep helper only makes a routing decision when the player is actually within a small epsilon of both axes of a tile centre, and tracks visited tiles itself, since the runtime snapshot exposes a dot count but not which specific tiles still carry one.
- Rationale: keeping level, fruit and score state changes behind a small number of named transitions — one reset, one score authority, one pending-fruit flag — is what keeps a level transition, a death and a fresh run from silently diverging from each other as more state accumulates, the same reasoning that shaped the state machine in [D011](#d011--m2-implementation-choices) and [D014](#d014--m3-implementation-choices).
- Authority: Claude's implementation choices under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews); subject to Codex review.
- Affected documents: `README.md`, `handoffs/M4.md`.

## D019 — M4 fix round choices

- Date: 2026-09-21.
- Status: implementation choices made by Claude in response to Codex findings M4-R1 and M4-R2; no PRD, scope, or budget change.
- Decision:
  - **`BestScoreStore.record` reconciles with storage before comparing, not only at construction.** The constructor still reads once to seed `#best`, but every `record` call now re-reads the current stored value first and raises `#best` to it if higher, before deciding whether the run's score is an improvement. A stale tab that opened before any instance had scored therefore cannot overwrite a higher best saved by another tab in the meantime: the next time it records anything, it first learns what is actually stored. This adds one storage read per `record` call, which `shell.ts` already calls only on a score-change event rather than every frame, so the brief's "without per-frame storage reads" bound is unchanged.
  - **Extra-life award-source tests isolate their named source rather than inferring it from a compound score.** Where a source's own award is smaller than what the scenario's dots or pellets already contribute, the irrelevant sources are zeroed in that test's config (`dotScore`, `powerPelletScore`, `letterScore` as needed) so the threshold can only be crossed by the action under test. The final-campaign-bonus case plays all five levels for real, with every other source zeroed, so four level bonuses provably land on a shared boundary and only the fifth — which also ends the campaign — crosses it. The death/respawn case now causes a genuine lethal contact rather than only a level transition, matching the finding's request for "a real death/respawn before checking no second grant."
- Rationale: a fix to `BestScoreStore` alone does not demonstrate the two instances' before/after relationship the review flagged, and a test whose named scenario cannot fail for the reason its title claims gives false confidence exactly as M4-R2 observed. Isolating each source is the direct way to make a test's title and its ability to fail agree.
- Authority: Claude's implementation choices under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews), resolving review findings recorded in `handoffs/M4.md`; subject to Codex recheck.
- Affected documents: `handoffs/M4.md`, `STATUS.md`.

## D020 — M5 mobile and PWA boundaries

- Date: 2026-09-21.
- Status: Codex planning choices within accepted PRD sections 5–8; no scope or budget change.
- Decision: M5 implements system reduced motion for canvas and CSS while retaining D015 default feedback; a visible touch pad, focus and responsive refinements; install metadata/original icons; complete production offline preparation; and safe worker updates at the repository subpath. Prefer native waiting activation with title/end-of-run guidance to close all app windows and reopen. Any optional immediate update action must prove every controlled client is safe; paused and between-level states are still part of a run. Preserve old-version assets and app-scoped cache isolation. Retain denied-storage browser regressions and exercise earned-life/new-result layouts carried from M4.
- Rationale: prevents stale-cache/subpath failures and active-run loss without coupling the worker to simulation logic. System preferences need no new settings screen. Production tests and explicit device evidence keep installation/offline claims separate from emulation.
- Authority: owner's request for the M5 brief under Codex's planning role. Audio remains excluded by D016; approved default enemy feedback remains allowed by D015. Missing devices are recorded as unverified, not silently treated as passed.
- Affected documents: `handoffs/M5.md`, `STATUS.md`, PRD progress note. Remaining fruit-edge regression expansion and three human release runs stay in M6.

## D021 — M5 implementation choices

- Date: 2026-09-21.
- Status: implementation choices made by Claude within the accepted M5 scope ([D020](#d020--m5-mobile-and-pwa-boundaries)); no PRD, scope, or budget change.
- Decision:
  - **The service worker is generated at build time, not hand-maintained.** `sw/service-worker.template.js` is a small, dependency-free template; a plugin in `vite.config.ts` (`hacmanServiceWorkerPlugin`, using only Vite's own `configResolved`/`closeBundle` hooks and Node's built-in `fs`/`crypto`) fills in the real, hashed asset list from what the production build actually wrote to disk — including the verbatim-copied `public/` files — plus a version hash derived from that list and `index.html`'s own content (never itself content-hashed by Vite, so an edit to it alone still changes the version). It runs only when `mode === 'production'`, so `npm run build:fixture` and `npm run dev` never emit or register it. Every cached URL is a path relative to the worker's own script location, which the Fetch/Cache APIs resolve against `self.location`, so the same generated file works whether the app is hosted at the origin root or under a subpath — no build-time knowledge of the deployed path is needed.
  - **The worker never calls `self.skipWaiting()` or `clients.claim()`, anywhere.** That omission alone is what makes the update lifecycle "safe": a newly installed version sits in `waiting` until every client controlled by the previous version has closed, which is the platform's own default behaviour, not code this project has to maintain. A failed or partial `cache.addAll()` during install rejects the whole install atomically, so a broken deploy simply never displaces whatever was already active — again the platform's default, not a retry/rollback mechanism built here. Cache names are namespaced by the worker's own `registration.scope` path, so an unrelated app hosted at a different subpath on the same origin can never collide with or be deleted by this app's cache cleanup.
  - **Cache matching explicitly ignores `Vary`.** A real bug surfaced while testing this: `vite preview`'s static file server sends `Vary: Origin`, and the `crossorigin` attribute Vite adds to the built `<script type="module">`/`<link rel="stylesheet">` tags makes the browser send those specific requests with an `Origin` header that the service worker's own internal `cache.addAll()` fetch did not send the same way — so `cache.match()` silently missed on exactly those two files while offline, serving nothing (a real ERR_FAILED for the app's own bundle) instead of the disguised-HTML failure the brief warns against. This cache only ever holds this worker's own precached build output, never third-party or negotiated content, so matching with `{ ignoreVary: true }` is both the fix and the correct general policy here — not a narrow workaround for one server's headers, since any CDN or host could add its own `Vary` header the same way.
  - **Reduced-motion presentation is factored into pure functions.** `src/render/motion.ts` exports `ballFillColor`, `pelletRadiusFactor`, `frightenedTone` and `protectionAlpha`, each taking a `reducedMotion` boolean and returning what to draw, with no canvas or DOM dependency; `MazeRenderer` calls them and owns only the boolean via `setReducedMotion()`. This is what makes the four decorative effects (D015's hue cycle, the pellet pulse, the frightened-expiry flash, the protection-ring pulse) unit-testable directly (`tests/motion.test.ts`) rather than only through canvas pixel sampling, while the existing D015 arithmetic in `tests/ballColor.test.ts` needed only an import-path change (it now imports from `motion.ts` and always passes `false`) to keep testing exactly the normal-motion behaviour it always did. Reduced motion pins the ball's hue-cycle phase to zero (a stable, still-contrasting colour), holds the pellet at a steady mid-cycle radius, holds the frightened-expiry warning at its flash tone without alternating, and holds the protection ring at a steady, clearly visible alpha; player movement, the mouth-chomp animation and every one-time transition (death ring, capture) are unaffected, since those are not continuously looping decoration. `src/app/reducedMotion.ts`'s `ReducedMotionWatcher` wraps `matchMedia('(prefers-reduced-motion: reduce)')`, including its `change` event, so a runtime OS change takes effect without a reload; it defaults to normal motion if `matchMedia` is unavailable rather than throwing. None of this touches simulation speed, timers, input, collision or scoring — `e2e/reducedMotion.spec.ts` includes a journey that toggles the preference while guessing is frozen and asserts the snapshot (score, revealed letters) is byte-identical before and after.
  - **App icons are generated, not sourced.** `scripts/generate-icons.mjs` hand-rolls a minimal PNG encoder (Node's own `zlib.deflateSync` for the IDAT stream, a hand-written CRC32 for chunk framing) so no image-processing dependency is added, and draws this project's own already-established shapes — the player's mouth-wedge disc from `src/render/renderer.ts#drawPlayer` and the ball's white ring — at a rotated, up-and-right-facing orientation with the ring drawn around the disc, in the project's own `--accent`/`--bg` palette. That combination (ring + rotated wedge) reads as this project's own established visual language (already reviewed and accepted across M1–M4) rather than a plain reproduction of the classic due-right arcade mark, addressing the brief's "avoid copyrighted game artwork" requirement; the owner should still swap in different artwork before any public or commercial use if that combination is judged too close for that purpose. Icons are emitted at 192/512 ("any" purpose), a 512 maskable variant (disc + ring kept inside the platform's 80%-diameter safe zone), and a 180 Apple touch icon, all fully opaque as Apple's guidance recommends.
  - **A new, narrowly scoped fixture parameter, not a change to any existing one.** `testBankWord=<index>` (`src/app/fixture.ts`) pins every level's word to `WORD_BANK[index]` — the real 50-entry campaign bank — the same way `testWord` already pins to `SEED_WORDS[index]`, existing solely because `SEED_WORDS`'s longest entry is 7 letters and dozens of committed M2–M4 tests depend on `testWord`/`testWords`' exact existing indices into `SEED_WORDS`, so extending or repointing those was not an option. It is what lets `e2e/layout-content.spec.ts` render a genuine eight-letter word and its real category without reaching level 5 through unpinned play (ruled impractical for a session in M4's own handoff) or adding any state setter or answer-revealing API; the word is still never read from the snapshot before the round is over.
  - **The title-screen PWA block never steals focus.** `initPwa` (`src/app/pwa.ts`) only ever assigns `textContent`/`hidden` on the offline-status line, the update notice, the install button and the help text — it never calls `.focus()` — so an install prompt becoming available or a service-worker state change can never pull focus away from whatever a keyboard or screen-reader user is doing. Offline-readiness text is derived from actual worker lifecycle events (`installed` with no existing controller, or `activated`), not from registration alone or from `navigator.onLine`; a background update check that later fails does not downgrade a readiness that was already achieved, since the previous, still-active version continues to work offline regardless of that unrelated failed check — only a failure before any version has ever finished installing is reported as an error.
- Rationale: the recurring pattern — derive from real build output rather than hand-maintain a parallel list, rely on the platform's own default lifecycle rather than re-implement it, and factor presentation decisions into pure functions — is what kept the worker, the icons and the reduced-motion effects each individually small and testable, the same reasoning that shaped the state machine in [D011](#d011--m2-implementation-choices)/[D014](#d014--m3-implementation-choices) and the scoring authority in [D018](#d018--m4-implementation-choices).
- Authority: Claude's implementation choices under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews); subject to Codex review.
- Affected documents: `README.md`, `handoffs/M5.md`.

## D022 — M5 fix-round choices (M5-R1–R5)

- Date: 2026-09-21.
- Status: implementation choices made by Claude resolving Codex's M5 review round 1 ([D021](#d021--m5-implementation-choices)); no PRD, scope, or budget change.
- Decision:
  - **Cache-scope matching is now exact, not a string prefix (M5-R1).** `sw/service-worker.template.js`'s `activate` handler previously deleted any existing cache name that merely started with its own `CACHE_PREFIX` — since the root scope `/` is itself a string prefix of every deeper scope (`/other-app/`, `/game/other/`, ...), a root or shallow installation could delete a sibling or nested app's still-valid cache. It now parses each existing cache name back into `(scope, version)` with `/^hacman-cache:(.*):[^:]+$/` and requires the scope to match this worker's own `SCOPE_PATH` by exact string equality before deleting it — always excluding its own current `CACHE_NAME`. `tests/serviceWorkerScope.test.ts` runs the real template source (not a reimplementation) in a Node `vm` sandbox with a fake `caches`/`self`, and asserts root/nested scopes each delete only their own stale versions while a sibling, a nested sibling and an unrelated cache name all survive.
  - **The version fingerprint now hashes real file bytes, not just filenames (M5-R2).** `vite.config.ts`'s plugin previously derived the worker's version from the precached *filenames* plus `index.html`'s content alone, so an icon, manifest or worker-template edit that left every filename unchanged (Vite never content-hashes `public/` copies or the template) silently produced a byte-identical `sw.js` that an existing installation would never treat as an update. The hashing logic is now `computeServiceWorkerSource` (exported, pure — no write, no console output), which hashes every precached file's actual bytes plus the worker template's own source. `tests/serviceWorkerVersion.test.ts` calls it directly against small controlled directories — far faster than a full `vite build` per case — and confirms an icon-content-only change and a template-only change each produce a different version while an unchanged rerun stays stable.
  - **The title overlay centers with `align-items/justify-content: safe center` (M5-R4).** Plain `center` clips the top of any panel taller than the viewport regardless of scrolling — the browser centers the box symmetrically even when it overflows, so `scrollTop 0` already sits past the panel's real top edge and nothing can scroll further up to reach it. This reproduced exactly as Codex measured it (heading `y ≈ -120px` at 360×640 with "Install manually" expanded). The CSS `safe` keyword (Box Alignment L3; supported by every browser this project targets by 2026) keeps centering while content fits and falls back to start-alignment — scrollable from a true top — the moment it does not, with no JS and no layout restructuring. `.pwa__help summary` also gained `box-sizing: border-box; min-height: 44px` so the disclosure's whole clickable row, not only its 15px text line, meets the touch-target size the rest of the app uses. `e2e/layout-content.spec.ts`'s new "expanding install help..." journey (360×640, both projects) reproduces the exact review scenario and was confirmed to fail against the pre-fix CSS (`y ≈ -112` to `-120`) before verifying it now passes.
  - **The safe-update test builds a genuinely different, then broken, third version instead of copying the active one (M5-R3).** The previous `e2e/pwa-update.spec.ts` built its "failed update" case by copying build B's *already-built* output and deleting an icon; since nothing about `index.html` or any other precached content changed, the emitted `sw.js` was byte-identical to the already-active B (even before D022's own M5-R2 fix, and unavoidably after it, since byte-identical input hashes identically), so the browser's own update algorithm never even attempted an install — `waiting === false` passed for the wrong reason. The test now builds a third, independently marked version (its own distinct `index.html` heading, so a genuinely distinct worker version) before deleting a required icon from it, and observes the real lifecycle through `updatefound`/`statechange` events (capturing the worker's already-`installing` state at attach time, then waiting for `redundant`) instead of an arbitrary two-second sleep. It also now reloads tab 1 once before asserting `navigator.serviceWorker.controller` (a first-ever load is never itself controlled, only `.ready`-eligible) to substantiate that the protected run really is controlled by build A before any update, and adds a fourth tab that starts a run and pauses it (Escape) before the update is discovered, asserting that paused run — not only the active one — is left completely undisturbed too, per the brief's explicit PAUSED-is-not-a-safe-boundary requirement. The undisturbed-tab-1 assertion now accepts any genuine in-run status (`chase`/`guess`/`resuming`/`countdown`), not only `chase`, since real gameplay keeps advancing on its own clock throughout the test and a legitimate catch during the update-discovery window is not itself a disturbance.
  - **A new file, `e2e/pwaSubpath.spec.ts`, proves AC4/AC5 at the real deployed path and completes a full offline campaign (M5-R5).** The existing `pwa.spec.ts` journeys only ever exercised the shared preview server's origin root and stopped after one scored keypress; neither matches the brief's explicit repository-subpath and complete-five-level-campaign requirements. The new file runs its own real `vite build` into an isolated directory and its own dedicated static server (mirroring `pwa-update.spec.ts`'s pattern) that serves it under `/bhj-ai-hackathon/` — the app's actual GitHub Pages path — confirms the manifest id/`start_url`/scope and every icon resolve inside that subpath, confirms the registered worker's own scope does too, then goes offline and completes all five levels through real chase/guess controls. Solving an unknown real word (no fixture parameter exists in production, and `word.answer` is only ever exposed once a round is already over) uses the exact allowance the brief's own exit demonstration names — "a test can know the bundled candidate bank and guess letters/chase repeatedly": it filters the real 50-entry `WORD_BANK` by the visible category/length/mask/wrong-letters, guesses the letter present in the most remaining candidates (usually correct, and always informative when not), and once exactly one candidate remains, guesses out its remaining letters with no more wrong guesses possible. A correct guess never needs a recatch (the guess panel stays open), so this typically finishes each level in only one or two catches despite not knowing the word in advance. The whole run took ~21s in the verification pass.
- Rationale: three of the five findings (R1, R2, R3) trace to variants of the same mistake — treating a symptom that happened to look right (a `startsWith` check, a filename list, a copied-not-rebuilt "broken" build) as equivalent to the real invariant (exact scope, real content, a genuinely distinct worker) — so each fix replaces the shortcut with the real check and a test that runs the real production code path (the actual template source, the actual plugin function, a real second `vite build`) rather than a reimplementation of it. R4 and R5 were both gaps in what was exercised, not defects in already-tested code, so both fixes are additive coverage of a scenario the original suite simply never reached.
- Authority: Claude's implementation choices resolving Codex's CHANGES_REQUESTED findings under the role split in [D002](#d002--claude-implements-codex-coordinates-and-reviews); subject to Codex's re-review.
- Affected documents: `README.md`, `handoffs/M5.md`, `STATUS.md`.

## D023 — M5 device validation accepted; M6 release boundary

- Date: 2026-09-24.
- Status: accepted; no product scope or budget change.
- Decision: accept M5 after the owner's report that device validation completed with no notes and the prior closure of M5-R1–R6. Proceed to M6 under PRD sections 7–8: regression and remaining edge coverage, limited cleanup, final README, fresh-checkout verification, three recorded human runs and demo rehearsal.
- Evidence boundary: the device result is owner-reported. Platform/version details, measured performance and a three-run pacing log were not supplied; do not invent them or treat the general report as satisfying every distinct release gate. Preserve historical evidence and record the later acceptance separately.
- Rationale: the named M5 blocker is closed; remaining release work belongs in M6 without adding features or silently waiving acceptance criteria.
- Authority: project owner's device-validation report and request for the M6 brief; Codex's coordination role under D002.
- Affected documents: `handoffs/M5.md`, `handoffs/M6.md`, `STATUS.md`, `PRD.md`. Claude updates the implementation README in M6.

## D024 — Recorded human playtests and demo rehearsal removed

- Date: 2026-09-24.
- Status: accepted by the project owner.
- Decision: remove the three recorded human playtests and demo rehearsal from project scope and release gates. Retire M6 AC6 and AC8; no run-log request or separate gameplay demo is required for M6 acceptance. This supersedes those portions of D020/D023 and historical handoff requirements.
- Rationale and authority: the project owner explicitly requested their removal after the M6 brief was prepared.
- Retained requirements: automated regression, targeted defect fixes, clean-install/build/preview verification, final documentation and accurate existing device evidence. M5 remains accepted. Pacing/performance targets do not become measured results through this scope reduction.
- Estimates: retain the existing planning allowances; no revised duration or measured usage is asserted.
- Affected documents: `PRD.md`, `STATUS.md`, `handoffs/M5.md`, `handoffs/M6.md`. Historical review entries remain intact.

## D025 — Apache License 2.0 for the release

- Date: 2026-09-24.
- Status: accepted by the project owner.
- Decision: the project is licensed under the Apache License, Version 2.0. `LICENSE` now holds the canonical text from <https://www.apache.org/licenses/LICENSE-2.0.txt> (SHA-256 `cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`), replacing the CC0 1.0 Universal text committed with the repository's initial commit (`7848a65`). `package.json` and `package-lock.json` already declared `Apache-2.0` (since M1) and are unchanged.
- Context: M6 found that `LICENSE` (CC0 1.0) contradicted the package metadata and the M6 brief's "existing Apache-2.0 license". Claude asked the owner which applies; the owner chose Apache-2.0.
- Note: commits before this change were published with the CC0 text; this decision does not alter what was distributed under those earlier revisions.
- Authority: project owner's answer during the M6 implementation session.
- Affected documents: `LICENSE`, `README.md`, `handoffs/M6.md`.
