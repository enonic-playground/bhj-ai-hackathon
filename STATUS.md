# Project status

Updated: 2026-09-17

## Current checkpoint

- Product baseline: PRD v1.0 accepted by the project owner.
- Current milestone: M1 — playable maze.
- State: ACCEPTED; Codex independently verified the M1 fixes on 2026-09-17.
- Current owner: Codex (planning the next milestone).
- Current milestone handoff: `handoffs/M1.md`.
- Baseline documentation commit: `061adc7b92d900d63b5e306ab45bd58c0f8c60b2`.
- Last accepted implementation commit: `1a60082863700f816a02a0affe94f805efd570c1`.
- Acceptance blockers: none. R1/R2 are closed by Codex. Nonblocking R3: refresh the root lockfile's stale Node engine range in Claude's next checkpoint.
- Implementation base SHA: `f99531c80f0bf8abf542c95f8b108da157bcab49` (working tree was clean; all planning work was already committed).
- Implementation commit under review: `1a60082863700f816a02a0affe94f805efd570c1` on `main`. It fixes R1/R2 on top of `86c5f10a91ad0a79e34b5d99ca45c6ac4f010775`, the revision Codex reviewed in round 1; `5a1bfc8` in between is a documentation-only checkpoint of that review write-up.
- Next action: Codex prepares the M2 implementation brief and includes R3 metadata cleanup. M2 is not READY until its brief exists.

## Milestones

| Milestone | State | Evidence / remaining work |
| --- | --- | --- |
| M0: scope and preparation | ACCEPTED | PRD v1.0 accepted; estimates reconciled; shared workflow files, wireframe descriptions/SVGs, and M1 brief complete. Wireframes visually verified by the project owner on 2026-09-17. |
| M1: playable maze | ACCEPTED | `1a600828`: Codex verified R1/R2, 46 unit/integration tests, 16 browser runs, and install/typecheck/tests/build on Node 22.12.0. Nonblocking R3 carried forward. |
| M2: defining loop | NOT_STARTED | Depends on accepted M1. |
| M3: arcade danger | NOT_STARTED | Depends on accepted M2. |
| M4: complete campaign | NOT_STARTED | Depends on accepted M3. |
| M5: mobile and PWA | NOT_STARTED | Depends on accepted M4. |
| M6: release quality | NOT_STARTED | Depends on accepted M5. |

## Verification and budget

Round 2 independent verification: Codex reran install, typecheck, 46 tests, build, and 16 browser runs on Node 26.7.0; also reran install/typecheck/46 tests/build on Node 22.12.0. All passed. R1/R2 are closed, M1 is accepted, and R3 is a nonblocking lockfile metadata follow-up. Historical attribution below describes the earlier handoff.

Round 1 was independently verified by Codex on 2026-09-17 on Node 26.7.0 at `86c5f10a`: `npm ci`, `npm run typecheck`, `npm test` (46 passed), `npm run build`, `npm run test:e2e` (14 passed), and production preview on port 4174. After the fixes, Claude reran the full sequence at `1a600828` from a clean install on Node 22.12.0, 24.13.0, and 26.7.0, each passing with 46 unit tests and 16 browser runs; `npm run dev` and `npm run preview` returned HTTP 200 on Node 26.7.0. The R1 resize case, which no earlier test covered, now has a browser regression that was confirmed failing before the fix. Node 20.19.0 is refused at install with `EBADENGINE`, as intended. These fix-round results are Claude's and await Codex's independent recheck. `npx playwright install chromium` is a one-time prerequisite for the browser suite. Mobile evidence is browser emulation at 360 × 640; real-device checks remain M5 work.

PRD section 9 is the estimate source: 18.5–24 focused hours, 9–13 active session hours included in that total, and 1.2–3.0 million cumulative model tokens including contingency. These are accepted planning figures, not observed usage. Agent-specific actual usage has not been recorded. The PRD still labels its session column “Codex”; log Claude and Codex actuals separately without silently changing the accepted budget.
