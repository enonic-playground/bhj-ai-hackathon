# Hac-Man — Product Requirements Document

Status: accepted implementation baseline, version 1.0. Approved by the project owner on 2026-09-16, with the M3 visual amendment (D015) and removal of audio (D016). See `STATUS.md` for implementation progress.

Claude owns implementation and tests; Codex owns planning, coordination, verification, and code review. Future scope changes must be recorded explicitly against this baseline.

## 1. Concept and intended outcome

Hac-Man is a single-player progressive web app combining maze-chase arcade action with letter-by-letter word discovery. Avoid enemies, collect bonuses, and catch a rolling ball to earn a guessing opportunity. Correct letters allow continued guessing; an incorrect letter returns the player to the maze. Solving the word completes the level, regardless of remaining dots.

The three-day outcome is a demo-ready, installable, offline-capable game for mobile and desktop, with automated tests and a complete setup guide. Target play sessions are 5–10 minutes, with approximately 1–3 minutes per level after tuning. These are design targets, not measured results.

Assumptions: one developer working with Codex, one original maze reused across five levels, original simple artwork, English words, no backend, and access to a phone for testing. Days are relative workdays, not scheduled dates.

## 2. Scope and arcade fidelity

“All components of the original Pac-Man” is interpreted for this three-day plan as the familiar gameplay systems below. Exact arcade emulation, original assets, original maze layout, frame-accurate timings, and intermission recreations are outside the estimate. This scope interpretation should be revisited if exact fidelity is essential.

| Component | Required behavior |
| --- | --- |
| Maze and player | Grid-based walls, corridors, buffered turns, continuous movement, animated player, side tunnel wraparound. |
| Dots | Collect once for points; clearing them never ends a level. |
| Power pellets | Temporary frightened enemies that can be eaten for increasing points. |
| Four enemies | Distinct targeting personalities: direct pursuit, ambush, patrol, and proximity-dependent pursuit. Simplified chase/scatter phases. |
| Enemy home | Timed releases, return home after being eaten, then rejoin play. |
| Bonus fruit | Timed collectible, spawned at defined dot thresholds. |
| Arcade run | Three starting lives, score, local high score, one extra life at a score threshold, death/restart, level transitions and animation. |
| Hac-Man additions | Moving catchable ball, word display, guessing keyboard, persistent guesses, five-level campaign. |

Required supporting features: start/instructions screen, pause/resume, restart, keyboard and touch controls, responsive layout, offline assets, install metadata, automated checks, and final README.

Audio, music, sound effects and mute controls are excluded from this project by owner decision D016. No audio assets, playback, audio preferences or audio-specific tests/cache requirements are planned.

Deferred: multiplayer, accounts, online leaderboards, generated words, external APIs, daily challenges, multiple languages, custom maze editor, extra maze layouts, endless play, full-word submissions, and a separate Hangman strike limit.

## 3. Gameplay rules

### Chase mode

- Move with arrow keys/WASD on desktop; use a visible directional pad or swipe on mobile. Queue the next legal turn at a junction.
- The rolling ball follows legal corridors, chooses directions at junctions, reverses at dead ends, and moves slower than the player. It does not collect items, collide with enemies, or enter the enemy home.
- Spawn the ball on a reachable corridor at least six path tiles from the player and outside the enemy home. Choose randomly from eligible cells; if none meet the distance rule, use the farthest eligible reachable cell. Never spawn directly on the player.
- Catching the ball enters Guessing mode immediately. Remove the ball while guessing.
- Contact with a non-frightened enemy costs one life. If lives remain, return actors to their starts, respawn the ball, and provide two seconds of protection. Preserve the word, guesses, score, and collected dots; reset enemy and power-up timers.
- Zero lives ends the run and reveals the word. Restart begins a fresh run.

### Guessing mode

- Freeze all maze simulation and timers, including enemies, frightened duration, fruit lifetime, and movement. Show the maze dimmed behind an accessible HTML letter keyboard.
- Display a word mask, category, and all previous guesses. Accept A–Z only, case-insensitively.
- A correct letter reveals every occurrence, awards points per newly revealed position, and keeps the player in Guessing mode.
- A wrong letter is recorded, then returns the player to Chase mode and respawns the ball. It does not directly consume a life; the penalty is another chase through danger.
- Duplicate guesses are disabled and ignored without a penalty or score change. Invalid keys have no effect.
- Clear held movement inputs on transitions. Use an explicit brief resume countdown after a wrong guess so the player can return to movement controls.
- The final correct letter ends the level exactly once. Advance only through the level-complete screen.

### Level and run progression

- Bundle at least 50 curated common English words of 4–8 letters, with categories. No repeated word within a run; repeated letters inside a word are allowed.
- Five levels use increasing word length and modestly faster enemies. Ball speed stays below player speed. Difficulty values live in configuration.
- Each new level resets the maze collectibles, guesses, actors, and timers, and keeps score and lives. Finishing level five shows campaign completion and a replay option.
- Pause, tab backgrounding, and focus loss freeze the simulation; returning requires explicit resume. Reloading returns to the title screen; saving a run mid-level is deferred.
- Persist only high score and preferences locally. Unavailable or corrupt storage must not prevent play.

### Initial scoring and timing values

These are tunable starting values, to be validated through playtesting:

| Event / setting | Initial value |
| --- | --- |
| Dot / power pellet | 10 / 50 points |
| Frightened enemies within one power-up | 200, 400, 800, 1,600 points |
| Correct letter | 100 per newly revealed position |
| Word solved | 1,000 points |
| Fruit | 100 × level number; spawn at 30% and 70% of dots collected, lasting 10 active seconds |
| Extra life | Once per run at 10,000 points |
| Frightened duration | 6 active seconds; another pellet refreshes the timer and resets the enemy score chain |
| Ball speed | 80% of player speed |

Collectibles stay consumed until the next level even when all dots are gone. The ball continues to operate, so every unfinished word remains solvable. Scoring is recreational and locally stored; competitive score integrity is out of scope.

## 4. State and collision contract

Application states: TITLE, CHASE, GUESS, RESUMING, PAUSED, DYING, LEVEL_COMPLETE, GAME_OVER, and CAMPAIGN_COMPLETE. PAUSED retains its previous active state. Only CHASE advances the maze simulation; countdown/transition states advance only their own timer.

For each simulation tick, apply movement and legal tile transitions, resolve collected items, resolve enemy collisions, then resolve ball capture if the player survived. A pellet collected on the same tick grants protection before enemy contact. Lethal enemy contact takes precedence over ball capture. Use swept contact or bounded movement steps so actors cannot pass through one another at low frame rates.

State transitions are centralized and processed once. UI input is routed only to its active mode. Inject clock and seeded randomness for reproducible tests; ordinary games may choose a random seed.

## 5. UX, accessibility, and delivery requirements

See [WIREFRAMES.md](WIREFRAMES.md) for mobile/desktop Chase and Guessing layouts, start/result screens, and transition behavior. These are planning references; runtime layout and accessibility checks remain implementation work.

- HUD always shows score, lives, level, current mode, and word progress. Use distinct ball and enemy shapes, with an unmistakable target marker. In M3, the ball fill cycles smoothly through the full hue spectrum once every two seconds of active maze time, retaining its contrasting ring so it is easier to spot on a busy screen.
- Keep maze and movement controls visible together on a 360 × 640 CSS-pixel viewport; rearrange for landscape and desktop without horizontal page scrolling.
- Touch controls and letter buttons target at least 44 × 44 CSS pixels. Prevent page gestures only in the gameplay controls, not throughout the site.
- Support keyboard-only menus and guessing, visible focus, labeled buttons, word updates announced through a live region, and non-color-only feedback. Full nonvisual navigation of the action maze is beyond the initial scope.
- Include reduced-motion support for decorative effects; avoid flashing effects except the existing M3 frightened-enemy expiry warning. The project owner approved that specific mild effect after user testing found it beneficial (D015); this is not a general exemption for other flashing effects.
- Target smooth 60 fps on a representative recent phone and laptop; verify that slower rendering does not change simulation speed. Record tested devices and observed limitations.
- PWA includes manifest, app icons, standalone presentation, and cached shell, words and artwork. After one completed online load, the entire campaign must work offline.
- Test installation on representative Android and iOS devices and desktop where supported; document the actual browser-specific steps during implementation.
- Apply app updates at the title screen or after a run, never by forcing reload during play. Validate offline behavior against the production build.
- No analytics, login, server, or runtime AI service. Static hosting is the intended delivery model; provider selection and public publishing are separate implementation decisions.

## 6. Implementation structure

Use TypeScript, Vite, Canvas 2D for the maze, and HTML/CSS for menus, HUD, and guessing controls. Keep the simulation independent of rendering and browser APIs. Use Vitest for unit/integration checks and Playwright for browser journeys. Pin compatible dependencies when implementation starts.

Suggested modules: game state/reducer, fixed-step simulation, maze graph and pathfinding, actor movement, enemy strategies, ball spawning, word rules, score rules, input adapters, canvas renderer, DOM interface, storage, and PWA lifecycle.

Store the maze as validated tile data with a shared traversal graph. Validate that player areas and ball spawns are connected. Use lightweight pathfinding at junctions, not every rendered frame. Use an accumulator with bounded catch-up for the simulation.

## 7. Three-day milestones

Complete these sequentially. Each implementation milestone ends with a runnable version and tests for its new behavior. Never move on with a broken previously working loop.

| Day / milestone | Work and exit demonstration | Focused work |
| --- | --- | --- |
| Day 1 — M0: scope | Finalize concept, rules, wireframe description, acceptance criteria, estimates, and this PRD. Exit: an implementable specification; no code required today. | 3–4 h |
| Day 2 — M1: playable maze | Set up build/test scripts and title screen; render maze, player, dots, keyboard and touch movement, walls and tunnels. Exit: run locally and navigate/collect without crossing walls. | 1.5–2 h |
| Day 2 — M2: defining loop | Add rolling ball, safe spawns, frozen guessing view, word rules, transition handling, and level completion. Exit: catch → correct guess → wrong guess → chase → solve. | 2–2.5 h |
| Day 2 — M3: arcade danger | Add four enemy strategies, home/release logic, chase/scatter, power pellets, lives, death, pause, restart, collision priority, and the two-second ball hue cycle. Exit: a complete playable one-level game with win and loss paths. | 3–3.5 h |
| Day 3 — M4: complete campaign | Add word bank, five levels, fruit, full scoring, extra life, high score and pacing adjustments. Exit: campaign completion and replay with a persistent high score. | 2–2.5 h |
| Day 3 — M5: mobile and PWA | Refine layout, input, focus, accessibility, install assets, offline cache, and safe update behavior. Exit: install and play offline after initial load; desktop and phone checks pass. | 1.5–2 h |
| Day 3 — M6: release quality | Full regression, edge cases, cleanup, README, clean-install rehearsal, and demo rehearsal. Exit: reproducible production build and all release gates satisfied. | 1.5–2 h |

Base work: 16.5–20.5 hours. Reserve another 2–3.5 hours for input, collision, caching, or device issues: **18.5–24 total hours across three days**. Day 1 is intentionally lighter; allow up to roughly ten hours on either build day if contingency is needed.

At each milestone: implement a small increment, add meaningful tests alongside it, run type checking/tests/build, manually demonstrate the exit path, then record a working checkpoint with commands, results, and next step. No placeholder success screens count as working features. Once CI exists, apply the same checks there.

Day 2 gate: the complete chase/guess/death loop must work. If behind, remove optional visual polish and defer stretch features first. Do not silently drop the ball loop, four enemies, touch controls, offline support, or tests to meet the date; report a scope or schedule change.

## 8. Test strategy and release acceptance

Tests are introduced with the owning milestone, then extended:

| Layer | Required coverage |
| --- | --- |
| Unit | Legal turns/walls/tunnels; maze reachability; ball spawn distance/fallback; enemy decisions and timers; repeated letters; duplicate guesses; score chain; extra life once; word selection without repeats. |
| Integration | Capture freezes simulation; correct guess stays; wrong guess respawns and resumes; final letter advances once; pellet/contact ordering; ghost death beats ball capture; death preserves word and dots; pause/background freezes timers; game-over/restart resets correctly. |
| Browser | Desktop and touch input; complete chase/guess journey; lose/restart; five-level completion using deterministic fixtures; responsive layout; high-score persistence; storage failure fallback. |
| Production/PWA | Cache completes after initial load; reload and play offline; all words/artwork/icons available offline; update does not interrupt play; supported install flows checked on real devices. |

Use deterministic test fixtures to reach hard-to-trigger states through the game API; retain at least one browser journey using actual player controls. Browser emulation complements real-device touch and installation checks.

Release gates:

- Every required feature above is implemented or a scope change is explicitly documented.
- A fresh checkout installs using documented commands, passes type checks, unit/integration/browser tests, and builds successfully.
- At least three complete runs are playtested, including a desktop run and a mobile run; record pacing and address blocking issues.
- No known soft locks, unreachable balls, unintended duplicate scoring, wall penetration, stuck movement, or forced mid-run updates.
- A real-device offline run and installation check are recorded; any unavailable-device validation is marked unverified.
- Final README explains concept, rules, controls, prerequisites and pinned runtime version, install/dev/test/build/preview commands, PWA install/offline behavior, architecture, content editing, known limitations, asset credits, and the existing license.
- Demo walkthrough demonstrates catch, correct and wrong guesses, frightened enemies, word completion, and offline play.

## 9. Session and token estimates

Estimates assume one developer plus one coding agent, bounded milestone tasks, modest original visuals, no large redesign, and roughly 1–2 correction cycles per milestone. They are planning allowances, not measured usage or guarantees.

“Focused work” is combined elapsed project work including implementation, review, tests, and playtesting; it does not add human and agent time when they overlap. “Active Codex session time” is the portion spent prompting, generating, inspecting, and iterating with the agent. It excludes breaks and unattended idle time.

| Day | Focused work, before contingency | Active Codex session time (included in work) | Suggested sessions | Cumulative model tokens |
| --- | --- | --- | --- | --- |
| 1: definition and PRD | 3–4 h | 1–2 h | 2 × 30–60 min | 0.10–0.25 million |
| 2: playable core | 6.5–8 h | 4–5 h | 4 × 60–75 min | 0.50–1.20 million |
| 3: campaign and release | 5–6.5 h | 3–4 h | 3–4 × approximately 60 min | 0.40–1.00 million |
| Base total | 16.5–20.5 h | 8–11 h | 9–10 sessions | 1.00–2.45 million |
| Budget including contingency | **18.5–24 h** | **9–13 h** | Add 1–2 repair sessions if needed | **1.2–3.0 million** |

Token definition: cumulative input plus output across model calls, including repeated/cached context and reported reasoning output where available. This is not the size of the final source code or one context window. An illustrative base workload of 80–120 calls at 10,000–17,000 input tokens and 2,000–3,500 output/reasoning tokens per call yields approximately 0.96–2.46 million tokens. Tool-heavy sessions or long contexts can exceed this substantially; these call counts and sizes are assumptions, not observed measurements.

Do not convert this total directly into a subscription allowance, credit estimate, or dollar amount. Model choice, context, reasoning, tool use, and caching affect usage; input, cached input, and output have different rates. See [official Codex usage documentation](https://learn.chatgpt.com/docs/pricing). No paid runtime AI calls are planned for players.

After M2, replace estimates with observed time and token usage where available. Record milestone, elapsed work, active session time, model, input/cached input/output totals, completed scope, and rework. If counters are unavailable, label token figures estimated rather than measured.

## 10. Principal delivery risks

| Risk | Planned response |
| --- | --- |
| “All original components” expands into arcade emulation | Use the explicit feature/fidelity boundary in section 2; re-estimate exact emulation separately. |
| Ball pursuit feels tedious | Keep it slower than the player; tune junction choices and spawn distances using playtests. Target first capture within 10–25 seconds on level one. |
| Guessing makes the action too easy or too punishing | Freeze safely, use common categorized words, and tune enemy speeds; retain the wrong-letter chase penalty. |
| Mobile controls or transitions cause accidental deaths | Buffered turns, visible D-pad, cleared input state, countdown, and real-phone tests. |
| Stale service worker breaks the demo | Test production offline/update paths and document cache recovery. |
| Time runs short | Protect the full working loop and release gates; spend contingency before adding optional visuals. |

M0 planning is complete and M1–M4 are accepted, including [M4's reviewed campaign checkpoint](handoffs/M4.md). [M5](handoffs/M5.md) (mobile usability and PWA) is implemented and in review; real-device install/offline/touch checks remain unverified pending device availability. See `AGENTS.md` for the workflow and `STATUS.md` for current progress. The final setup README is a Day 3 deliverable based on verified implementation commands.
