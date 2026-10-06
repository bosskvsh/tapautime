---
name: senior-deep-debugging
description: Forensic, evidence-first protocol for deep defects (intermittent, cross-boundary, silent data loss, RLS 0-row anomalies, or race conditions). Triggers on "deep debug", "intermittent", "silent failure", "race condition", "data loss", or when direct debugging fails.
---

# Senior Deep Debugging Protocol (High Efficiency)

When diagnosing complex, cross-boundary, or silent defects, follow this evidence-first framework with minimal token footprint.

---

## 0. Scope & Execution Gate

- **Inline Execution (Default):** For bugs contained to code logic, query parameters, or state synchronization, formulate `<deep_diagnosis>`, apply the surgical fix, and verify in a single turn. Do not stop for approval unless required.
- **Stop-for-Approval Gate:** STOP after `<deep_diagnosis>` and await explicit confirmation ONLY if the fix requires schema migrations, irreversible data transformations, or external billing/auth alterations.

---

## 1. Targeted Forensic Investigation

- **Pinpoint Search:** Use `grep_search` with file filters and read tight line ranges (±20 lines). Never read entire large files (>100 lines).
- **Active Path Tracing:** Trace only the boundary layers directly involved in the failure path (e.g. UI State ↔ Edge Function ↔ DB). Do not inspect unrelated layers.
- **Empirical Proof:** Never guess root causes or apply speculative patches. Confirm caller semantics, payload shapes, and RLS behavior (remember: RLS returns 0 rows, not an error).
- **Browser/E2E Guard:** NEVER run Playwright, browser subagents, or automated browser test runners unless explicitly requested.

---

## 2. Compact Output: `<deep_diagnosis>`

Wrap diagnostic findings in a concise XML envelope (keep under 150 tokens):

```xml
<deep_diagnosis>
- Root Cause: [Exact failure mechanism with file and line reference]
- Active Boundary: [Only failing layers, e.g. Client Hook ↔ Postgres RLS]
- Defensive Fix: [Surgical minimal diff to be applied or proposed]
</deep_diagnosis>
```

---

## 3. Surgical Fix & Verification

- **Minimal Diff:** Modify only the necessary lines to eradicate the root cause. Zero unrequested refactoring.
- **Zero Mock Data:** Empty results render genuine empty states. Never add fallback mock records.
- **Concurrency & Types:** Apply Optimistic Concurrency Control (`WHERE status = previous_status`), timestamp checks (`updated_at`), and defensive type-guards/null-checks.
- **Verification:** Run the strongest available syntax/typecheck command (e.g., `npx tsc --noEmit` or `node -c <file>`) and report the exact command and result.

