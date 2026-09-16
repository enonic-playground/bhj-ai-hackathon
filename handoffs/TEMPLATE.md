# M<N> — <milestone title>

Template only. Copy to `handoffs/M<N>.md` and replace placeholders before marking READY.

## Brief — Codex

- State: NOT_STARTED.
- Owner: <Codex / Claude>.
- PRD version and relevant sections: <references>.
- Repository/branch: <path and branch>.
- Base commit: <full SHA of agreed starting checkpoint>.
- Dependencies: <accepted milestones or other prerequisites>.
- Objective: <working behavior delivered>.
- In scope: <features and expected files/modules>.
- Out of scope: <explicit boundaries>.
- Required checks and manual demonstration: <real commands when available; otherwise expected checks for Claude to establish>.

| ID | Acceptance criterion | Required evidence |
| --- | --- | --- |
| AC1 | <observable behavior> | <test/manual demonstration> |

## Implementation handoff — Claude

- Implementation commit: <full SHA; record after creating the checkpoint>.
- Summary: <what changed and why>.
- Criteria evidence: <AC IDs mapped to tests and manual results>.
- Checks: <exact command, outcome, relevant result; include failures>.
- Manual demonstration: <steps, device/browser, result>.
- Decisions/deviations: <decision IDs; no silent scope changes>.
- Known limitations and unverified items: <details or none>.
- Working-tree changes outside the reviewed commit: <paths and explanation, or clean>.
- Next action: <specific review request>.
- Work/session time and token usage: <agent, measured/estimated, or unavailable>.

## Review round 1 — Codex

- Reviewed base and implementation SHAs: <full SHAs>.
- Independently run checks: <commands and outcomes>.
- Checks reported by Claude but not independently verified: <list>.
- Acceptance criteria assessment: <AC IDs, evidence, gaps>.

| Finding ID | Severity | File / line | Impact and required behavior | Status |
| --- | --- | --- | --- | --- |
| R1 | <blocking/nonblocking and priority> | <reference> | <concrete finding> | OPEN |

- Outcome: <CHANGES_REQUESTED / ACCEPTED / BLOCKED with reason>.
- Next owner and action: <details>.
- Work/session time and token usage: <measured/estimated, or unavailable>.

## Fix response — Claude, if needed

- New implementation commit: <full SHA>.
- Finding resolutions: <each ID and evidence, or reason for disagreement>.
- Checks and regression results: <commands/outcomes>.
- Remaining limitations: <details>.

Append another review round for the new revision. Do not overwrite previous findings or treat the fix response itself as acceptance.

## Acceptance — Codex

- Accepted implementation commit: <full SHA>.
- Criteria satisfied and remaining nonblocking limitations: <evidence/references>.
- Status update: <update STATUS.md with checkpoint, owner, next action>.
