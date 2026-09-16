# Hac-Man shared agent workflow

## Roles and source of truth

- Claude implements application code, configuration, automated tests, and implementation documentation, including fixes requested in review.
- Codex plans milestones, coordinates handoffs, maintains planning documents, runs verification, and reviews code. Codex reports implementation fixes to Claude rather than editing implementation files unless the project owner explicitly changes this role split.
- The project owner decides product direction and scope changes. Routine implementation choices within the accepted scope do not require additional approval.
- `PRD.md` is the accepted product specification and estimate source. `DECISIONS.md` records decisions and their reasons. `STATUS.md` records current progress, ownership, and the next action. A milestone handoff records the brief, implementation evidence, and review history.
- Keep shared rules here. `CLAUDE.md` is only an entry point to these instructions. Do not duplicate the PRD or maintain competing task lists.

## Start or resume a session

1. Read this file, `PRD.md`, `STATUS.md`, `DECISIONS.md`, and the current handoff named in `STATUS.md`, if any. Read the README for available setup commands and relevant nested instructions before editing their files.
2. Inspect the repository path, current branch, HEAD commit, and working-tree changes. Compare them with the handoff's base and implementation commits. Do not reset, discard, or overwrite unfamiliar changes.
3. Briefly state your role, current milestone, relevant acceptance criteria, and next action. Resolve material conflicts using repository evidence and the project owner's latest instructions; do not silently choose a different scope.
4. Reread status and the handoff before resuming after another agent has worked, even within the same conversation. Chat history alone is not authoritative project memory.

## Ownership and synchronization

- In a shared checkout, only the current owner edits files. Transfer ownership through `STATUS.md` when handing off. This is a coordination convention, not an automatic lock or notification system.
- Claude owns the checkout during implementation/fixes; Codex owns it during planning/review. Do not change branches or modify code while the other agent is working there.
- If concurrent work is explicitly requested, use separate worktrees and agree on non-overlapping scope. Exchange commits and reconcile documentation; uncommitted files do not transfer between worktrees.
- Record decisions affecting product behavior or architecture in `DECISIONS.md`, with proposed/accepted/superseded status and rationale. Record owner-approved scope changes in the PRD as well. Never treat an agent's suggestion as owner approval.

## Milestone cycle

1. Codex creates `handoffs/M<N>.md` from `handoffs/TEMPLATE.md`, specifying scope, exclusions, numbered acceptance criteria, required verification, and the base commit. Mark READY only when the brief is actionable.
2. Claude marks IMPLEMENTING and implements that milestone, adding meaningful unit and integration tests alongside features. Preserve the previous working baseline.
3. Claude runs the checks, records exact commands/results and limitations, and prepares a committed implementation checkpoint for review. Record its full commit SHA in the handoff; a later documentation-only commit can contain that record. Do not attempt to put a commit's own SHA inside itself.
4. Claude marks REVIEW and transfers ownership to Codex. The project owner or an explicitly configured coordinator triggers the receiving agent; editing a file alone does not wake it.
5. Codex reviews the exact base-to-implementation diff and relevant surrounding code against the acceptance criteria, and independently runs relevant checks. Distinguish verified results from Claude's reported results. Review findings include a stable ID, severity, file/line, concrete impact, and expected behavior.
6. If fixes are required, Codex marks CHANGES_REQUESTED and transfers ownership to Claude. Claude records a resolution for each finding, runs checks, records the new implementation SHA, and returns to REVIEW. Codex rechecks the affected behavior and regressions.
7. Codex marks ACCEPTED only when the milestone criteria are satisfied and blocking findings are resolved. Update the last accepted implementation commit and next action in `STATUS.md`. Acceptance is tied to the reviewed revision; later code changes need review.

Normal flow: READY → IMPLEMENTING → REVIEW → ACCEPTED, with REVIEW → CHANGES_REQUESTED → REVIEW as needed. NOT_STARTED and BLOCKED are additional states; a blocked entry names the dependency and resumption condition.

## Verification and handoffs

- Use the actual repository scripts. At present no application or executable checks exist; do not invent commands or claim checks passed.
- Once available, run type checking, applicable tests, and the production build at each implementation milestone. Include its manual exit demonstration. PWA checks must use the production build as specified in the PRD.
- For each acceptance criterion, link evidence or explicitly mark it unverified. Record failed checks, unavailable devices, and known limitations honestly. Tests and reviews do not substitute for required real-device checks.
- Review correctness, game-state transitions, regressions, tests, maintainability, and relevant mobile/offline behavior. Prefer concrete defects over stylistic preferences already handled by tooling.
- Before a handoff or ending a session, update status with owner, state, exact next action, blockers, and current handoff path. Keep implementation and review sections separate; append review rounds rather than erasing earlier findings.
- Keep documentation concise. Record milestone elapsed work and agent session time separately where available; record Claude and Codex token usage separately, clearly labeling estimates. The accepted PRD budget remains authoritative until explicitly revised.
- Do not mark all of M0 complete just because the product baseline is accepted. Its remaining preparation is tracked in `STATUS.md`.
