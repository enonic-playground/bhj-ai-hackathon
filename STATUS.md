# Project status

Updated: 2026-09-17

## Current checkpoint

- Product baseline: PRD v1.0 accepted by the project owner.
- Current milestone: M3 — arcade danger.
- State: REVIEW; Claude implemented M3 on 2026-09-17 at `cf8be8ab9bb94817a1b329f2c83d16b9520482c1`.
- Current owner: Codex (review). Claude has released the checkout.
- Current milestone handoff: `handoffs/M3.md`.
- Baseline documentation commit: `061adc7b92d900d63b5e306ab45bd58c0f8c60b2`.
- Last accepted implementation commit: `0be0b4399100666b7fc52f488b394375d178cdfb` (M2).
- Acceptance blockers: none to starting M3. M2-R1/R2 and M1 R1/R2/R3 are closed. Real-device and human playtest limitations remain recorded in M2's handoff.
- M3 implementation base: `3b5255a11870d29ce5e25cc3141a258e8740ab24` on `main`. The planning the brief expected to find uncommitted (M2 acceptance, M3 brief, coordination updates) was already committed there, so nothing needed a separate checkpoint. The brief's reference HEAD `e47ca4777d1d5169559e287a49cdf5cc90c4aa55` is that commit's parent.
- Next action: Codex reviews `3b5255a1..cf8be8ab` against AC1–AC10 in `handoffs/M3.md`, runs the checks independently, and records findings or acceptance. No agent was launched automatically; the project owner triggers the review.


## Milestones

| Milestone | State | Evidence / remaining work |
| --- | --- | --- |
| M0: scope and preparation | ACCEPTED | PRD v1.0 accepted; estimates reconciled; shared workflow files, wireframe descriptions/SVGs, and M1 brief complete. Wireframes visually verified by the project owner on 2026-09-17. |
| M1: playable maze | ACCEPTED | `1a600828`: Codex verified R1/R2, 46 unit/integration tests, 16 browser runs, and install/typecheck/tests/build on Node 22.12.0. Nonblocking R3 carried forward. |
| M2: defining loop | ACCEPTED | `0be0b439`: Codex closed M2-R1/R2; independently passed install/typecheck/build, 120 unit/integration tests and 39 browser tests (1 skipped) on Node 26.7.0. See handoff review round 2. |
| M3: arcade danger | REVIEW | `cf8be8ab`: four enemies, home lifecycle, pellets and frightened scoring, ordered collisions, three lives with death/restart, and PAUSED with explicit resume. Claude reports 198 unit/integration tests and 56 browser runs (2 skipped) on Node 26.7.0; awaiting Codex's independent checks. |
| M4: complete campaign | NOT_STARTED | Depends on accepted M3. |
| M5: mobile and PWA | NOT_STARTED | Depends on accepted M4. |
| M6: release quality | NOT_STARTED | Depends on accepted M5. |

## Verification and budget

M3 implementation round (Claude's reported results): from a removed `node_modules`, `npm ci`, `npm run typecheck`, `npm test` (198 tests in 15 files, up from 120), `npm run build`, `npm run build:fixture` and `npm run test:e2e` (56 passed, 2 intentional touch-only skips) all passed on Node 26.7.0 (npm 11.19.0), macOS arm64. The browser suite was run four times end to end after the final change, each clean. `npm run dev`, `npm run preview` and `npm run preview:fixture` returned HTTP 200. Verification found and fixed two real UI defects — the mobile guessing panel painted over the pause overlay and swallowed taps meant for Resume, and the four-stat HUD overflowed 360 px — as well as three defects in the new journeys themselves. Node 22.12.0 was **not** available in this session, so the advertised minimum was not re-verified for M3; the engine range and lockfile are unchanged. Mobile evidence is emulation at 360 × 640, the hidden tab is still simulated inside the page, and no human playtest or real-device check is claimed: enemy pacing remains the brief's starting values and is unvalidated. Claude's elapsed work was about 1.5 h against the PRD allocation of 3–3.5 focused hours; token usage was not measured. Screenshots are in `docs/evidence/m3/`; `docs/evidence/m2/` is unchanged.

M2 review round 2 (Codex): independently passed `npm ci`, typecheck, 120 tests, production build and the dual-build browser suite (39 passed, 1 skipped) on Node 26.7.0. Hidden-time regressions pass and ordinary output contains no fixture controls. M2 is accepted at `0be0b439`. Claude's Node 22.12.0 verification remains reported, not repeated in this round. No real-device or human playtest is claimed. Review time and Codex token usage were not measured. Historical results follow.

M2 fix round 1 (Claude's reported results): frame timing moved into `src/app/frameTiming.ts` so a suspension discards the frame timestamp as well as the loop's buffered time, and the deterministic start-up parameters now exist only in a test-only build (`npm run build:fixture`), with the browser suite serving that build and the ordinary production build separately. From a removed `node_modules`, `npm ci`, `npm run typecheck`, `npm test` (120 tests in 10 files), `npm run build` and `npm run test:e2e` (39 passed, 1 skipped) all passed on Node 26.7.0 (npm 11.19.0) and on the advertised minimum Node 22.12.0 (npm 10.9.0), macOS arm64. `npm run dev`, `npm run preview` and `npm run preview:fixture` returned HTTP 200 on Node 26.7.0. Both new regressions were confirmed failing before the fix. Playwright no longer reuses an already listening preview server, after a stale bundle passed a check the current build failed. Claude's work for this round was about 1.1 h; token usage was not measured. Limitations are unchanged: mobile evidence is emulation, the hidden tab is simulated inside the page because Playwright cannot background a page it drives, and no human playtest or real-device check is claimed.

M2 review round 1 (Codex): independently passed `npm ci`, typecheck, 112 tests, production build and 31 browser runs (1 skipped) on Node 26.7.0. A separate deterministic harness reproduced hidden-time countdown consumption; code and bundle inspection confirmed production fixture controls. M2 remains CHANGES_REQUESTED for M2-R1/R2. Node 22 results below remain Claude-reported. Review time and token usage were not measured.

M2 implementation round (Claude's reported results): from a removed `node_modules`, `npm ci`, `npm run typecheck`, `npm test` (112 tests in 9 files), `npm run build` and `npm run test:e2e` (31 passed, 1 skipped) all passed on Node 26.7.0 (npm 11.19.0) and on the advertised minimum Node 22.12.0 (npm 10.9.0), macOS arm64. `npm run dev` and `npm run preview` returned HTTP 200 on Node 26.7.0. The 46 M1 tests are unchanged in substance and still pass; they now use deterministic ball-free or pinned-spawn fixtures, and the M1 browser journeys use the documented `testBall=off` start-up parameter, so a legitimate capture cannot interrupt a movement assertion. The browser suite builds and previews production output. Screenshots for Chase, Guessing, the countdown, the result panel and the short-viewport layouts are in `docs/evidence/m2/` for both the desktop and the emulated mobile project. Mobile evidence is emulation at 360 × 640; real-device checks remain M5 work, and no human playtest has been done yet. M2 elapsed agent work was approximately 50 minutes against the PRD allocation of 2–2.5 focused hours; token usage was not measured.

Round 2 independent verification: Codex reran install, typecheck, 46 tests, build, and 16 browser runs on Node 26.7.0; also reran install/typecheck/46 tests/build on Node 22.12.0. All passed. R1/R2 are closed, M1 is accepted, and R3 is a nonblocking lockfile metadata follow-up. Historical attribution below describes the earlier handoff.

Round 1 was independently verified by Codex on 2026-09-17 on Node 26.7.0 at `86c5f10a`: `npm ci`, `npm run typecheck`, `npm test` (46 passed), `npm run build`, `npm run test:e2e` (14 passed), and production preview on port 4174. After the fixes, Claude reran the full sequence at `1a600828` from a clean install on Node 22.12.0, 24.13.0, and 26.7.0, each passing with 46 unit tests and 16 browser runs; `npm run dev` and `npm run preview` returned HTTP 200 on Node 26.7.0. The R1 resize case, which no earlier test covered, now has a browser regression that was confirmed failing before the fix. Node 20.19.0 is refused at install with `EBADENGINE`, as intended. These fix-round results are Claude's and await Codex's independent recheck. `npx playwright install chromium` is a one-time prerequisite for the browser suite. Mobile evidence is browser emulation at 360 × 640; real-device checks remain M5 work.

PRD section 9 is the estimate source: 18.5–24 focused hours, 9–13 active session hours included in that total, and 1.2–3.0 million cumulative model tokens including contingency. These are accepted planning figures, not observed usage. Agent-specific actual usage has not been recorded. The PRD still labels its session column “Codex”; log Claude and Codex actuals separately without silently changing the accepted budget.
