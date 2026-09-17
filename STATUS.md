# Project status

Updated: 2026-09-17

## Current checkpoint

- Product baseline: PRD v1.0 accepted by the project owner.
- Current milestone: M1 — playable maze.
- State: REVIEW; Claude completed the M1 implementation on 2026-09-17.
- Current owner: Codex (review); Claude has transferred the checkout.
- Current milestone handoff: `handoffs/M1.md`.
- Baseline documentation commit: `061adc7b92d900d63b5e306ab45bd58c0f8c60b2`.
- Last accepted implementation commit: none; application development has not started.
- Blockers: none identified for starting M1. The project owner visually verified the wireframes on 2026-09-17; inspect the implemented UI during M1.
- Implementation base SHA: `f99531c80f0bf8abf542c95f8b108da157bcab49` (working tree was clean; all planning work was already committed).
- Implementation commit under review: `86c5f10a91ad0a79e34b5d99ca45c6ac4f010775` on `main` (base `f99531c80f0bf8abf542c95f8b108da157bcab49`).
- Next action: Codex reviews the base-to-implementation diff against AC1–AC8, independently runs `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`, then records findings or acceptance.

## Milestones

| Milestone | State | Evidence / remaining work |
| --- | --- | --- |
| M0: scope and preparation | ACCEPTED | PRD v1.0 accepted; estimates reconciled; shared workflow files, wireframe descriptions/SVGs, and M1 brief complete. Wireframes visually verified by the project owner on 2026-09-17. |
| M1: playable maze | REVIEW | Implemented from base `f99531c8`: playable maze, movement, dots, keyboard and pad input, responsive shell, 46 unit/integration tests and 14 browser runs passing. Evidence in `handoffs/M1.md`. |
| M2: defining loop | NOT_STARTED | Depends on accepted M1. |
| M3: arcade danger | NOT_STARTED | Depends on accepted M2. |
| M4: complete campaign | NOT_STARTED | Depends on accepted M3. |
| M5: mobile and PWA | NOT_STARTED | Depends on accepted M4. |
| M6: release quality | NOT_STARTED | Depends on accepted M5. |

## Verification and budget

Verified on 2026-09-17 from a clean install on Node 26.7.0: `npm ci`, `npm run typecheck`, `npm test` (46 passed), `npm run build`, `npm run test:e2e` (14 passed), `npm run dev`, and `npm run preview`. `npx playwright install chromium` is a one-time prerequisite for the browser suite. Mobile evidence is browser emulation at 360 × 640; real-device checks remain M5 work.

PRD section 9 is the estimate source: 18.5–24 focused hours, 9–13 active session hours included in that total, and 1.2–3.0 million cumulative model tokens including contingency. These are accepted planning figures, not observed usage. Agent-specific actual usage has not been recorded. The PRD still labels its session column “Codex”; log Claude and Codex actuals separately without silently changing the accepted budget.
