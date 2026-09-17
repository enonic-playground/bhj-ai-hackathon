# Project status

Updated: 2026-09-17

## Current checkpoint

- Product baseline: PRD v1.0 accepted by the project owner.
- Current milestone: M1 — playable maze.
- State: CHANGES_REQUESTED; Codex completed M1 review round 1 on 2026-09-17.
- Current owner: Claude (fixes); Codex has transferred the checkout.
- Current milestone handoff: `handoffs/M1.md`.
- Baseline documentation commit: `061adc7b92d900d63b5e306ab45bd58c0f8c60b2`.
- Last accepted implementation commit: none; M1 is implemented but not accepted.
- Acceptance blockers: R1 (maze overflows after reducing desktop viewport height) and R2 (advertised Node minimum is incompatible with pinned Vitest). See review round 1 in `handoffs/M1.md`.
- Implementation base SHA: `f99531c80f0bf8abf542c95f8b108da157bcab49` (working tree was clean; all planning work was already committed).
- Implementation commit under review: `86c5f10a91ad0a79e34b5d99ca45c6ac4f010775` on `main` (base `f99531c80f0bf8abf542c95f8b108da157bcab49`).
- Next action: Claude fixes R1/R2, adds the resize regression, verifies the supported runtime, reruns checks, and records a new implementation checkpoint for Codex review. Do not start M2 yet.

## Milestones

| Milestone | State | Evidence / remaining work |
| --- | --- | --- |
| M0: scope and preparation | ACCEPTED | PRD v1.0 accepted; estimates reconciled; shared workflow files, wireframe descriptions/SVGs, and M1 brief complete. Wireframes visually verified by the project owner on 2026-09-17. |
| M1: playable maze | CHANGES_REQUESTED | Codex independently verified 46 unit/integration tests and 14 browser runs passing; R1/R2 require fixes. Review evidence in `handoffs/M1.md`. |
| M2: defining loop | NOT_STARTED | Depends on accepted M1. |
| M3: arcade danger | NOT_STARTED | Depends on accepted M2. |
| M4: complete campaign | NOT_STARTED | Depends on accepted M3. |
| M5: mobile and PWA | NOT_STARTED | Depends on accepted M4. |
| M6: release quality | NOT_STARTED | Depends on accepted M5. |

## Verification and budget

Independently verified by Codex on 2026-09-17 on Node 26.7.0: `npm ci`, `npm run typecheck`, `npm test` (46 passed), `npm run build`, `npm run test:e2e` (14 passed), and production preview on port 4174. Claude's development-server smoke is reported in the handoff but was not repeated by Codex. Existing tests miss the desktop resize failure in R1. `npx playwright install chromium` is a one-time prerequisite for the browser suite. Mobile evidence is browser emulation at 360 × 640; real-device checks remain M5 work.

PRD section 9 is the estimate source: 18.5–24 focused hours, 9–13 active session hours included in that total, and 1.2–3.0 million cumulative model tokens including contingency. These are accepted planning figures, not observed usage. Agent-specific actual usage has not been recorded. The PRD still labels its session column “Codex”; log Claude and Codex actuals separately without silently changing the accepted budget.
