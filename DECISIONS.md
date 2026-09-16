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
