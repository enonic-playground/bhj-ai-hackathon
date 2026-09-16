# Hac-Man

A planned mobile and desktop progressive web app that combines maze-chase arcade action with a word-guessing game.

Catch a moving ball to enter Guessing mode. Reveal letters to solve the level's word; an incorrect guess sends you back into the maze to catch the ball again. Dots, ghosts, power pellets, and bonus items keep each chase active.

## Project status

Product baseline v1.0 accepted on 2026-09-16. Shared agent workflow files are in place. M0 preparation remains: wireframes and the M1 implementation brief. No application or executable setup commands exist yet.

Claude handles implementation and tests; Codex handles planning, coordination, verification, and code review.

Both agents follow [AGENTS.md](AGENTS.md) and resume from [STATUS.md](STATUS.md). Durable decisions live in [DECISIONS.md](DECISIONS.md); milestone briefs and review evidence use the [handoff template](handoffs/TEMPLATE.md). [CLAUDE.md](CLAUDE.md) points Claude to the shared instructions.

See [PRD.md](PRD.md) for game rules, scope, architecture, milestone acceptance criteria, tests, and estimates.

## Three-day delivery target

| Day | Outcome | Focused time before contingency |
| --- | --- | ---: |
| 1 | Product definition, rules, scope, and milestones | 3–4 hours |
| 2 | Playable maze, guessing loop, and core arcade mechanics | 6.5–8 hours |
| 3 | Campaign, mobile/PWA completion, polish, testing, and documentation | 5–6.5 hours |

Base estimate: **16.5–20.5 focused hours**, including **8–11 hours of active Codex sessions**, across **9–10 sessions**, and **1.00–2.45 million cumulative model tokens**.

Budget including contingency: **18.5–24 focused hours**, including **9–13 hours of active Codex sessions**, and **1.2–3.0 million cumulative model tokens**. Allow 1–2 additional repair sessions if needed. Active session time is included in focused work, not added to it.

Tokens include cumulative input and output across model calls, repeated/cached context, and reported reasoning output where available. These are planning allowances, not measured usage or guarantees. [PRD section 9](PRD.md#9-session-and-token-estimates) is the source of truth for estimates and assumptions.

Verified setup, execution, build, test, and installation instructions will be added as the application is implemented and completed by the final milestone.
