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
