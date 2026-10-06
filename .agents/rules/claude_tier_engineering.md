---
trigger: always_on
description: Enforce the claude-tier-software-engineer delivery protocol on all implementation work.
---

# Claude-Tier Engineering Protocol

Apply the `claude-tier-software-engineer` skill to **all** implementation work (build, edit, refactor, migrate).

1. **Classify blast radius first** (Trivial / Standard / Critical) before inspecting or editing anything.
2. **Critical tasks stop for approval.** Present `<implementation_plan>` and wait for explicit user approval before writing code.
3. **Scope lock.** Never edit a file outside the approved plan without a `<plan_amendment>` and re-approval.
4. **Verify before claiming done.** Run the strongest available syntax/build check and report the exact command and its actual result.
5. **Data flow first** for features and mutations: Database -> Edge Function -> State -> UI.
6. **TapauTime non-negotiables override generic practice:**
   - No JS floats for money; atomic `Ledger_Entries` inserts.
   - Assume RLS is active; use OCC (`WHERE status = previous_status`).
   - Zero mock/dummy/fallback data — empty results render genuine empty states.
   - `packages/shared-ui` stays 100% pure/presentational.
   - No Playwright/browser automation and no `animate-pulse` unless explicitly requested.
7. **Precedence when rules collide:** user instruction > `strict_execution.md`/`no_mock_data.md` > `token_efficiency.md` > this protocol > `ponytail.md`.

## Delegation

Route specialist work out instead of duplicating it: bugs -> debugging protocol (`senior-debugging-protocol` / `senior-deep-debugging` per `debugging_protocol.md`); data-flow audits -> `full-stack-pipeline-auditor`; mock-data removal -> `production-data-migration`; architecture/realtime design -> `foolproof-architecture`; UI and a11y -> `ui-review` / `ui-a11y`.

Skill source: `~/.gemini/config/skills/claude-tier-software-engineer/SKILL.md`
