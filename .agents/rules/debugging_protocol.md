# Mandatory Senior Debugging Protocol Rule

Whenever investigating, troubleshooting, fixing a bug, or solving a system issue:

1. **Select the Correct Debugging Tier First** (criteria in `senior-deep-debugging` §0):
   - **Standard tier** — a thrown error with a clear stack trace, or a fault contained to a single layer that reproduces reliably: enforce the **`senior-debugging-protocol`** skill.
   - **Deep tier** — intermittent, non-reproducible, cross-boundary, silent failure (no error, wrong or empty data), data loss, race condition, two clients disagreeing, or a prior fix that did not hold: enforce the **`senior-deep-debugging`** skill.
   - **Never load both tiers for the same bug.** The triage gate selects exactly one.

2. **Always Enforce the Selected Skill**:
   - **Deterministic Isolation First**: Never guess or apply speculative patches. Isolate exact sequences, state transitions, or payloads triggering the issue.
   - **Systematic Hypothesis Formulation**: State the root-cause hypothesis and verified failure mechanism before writing fixes.
   - **Targeted Boundary Tracing**: Trace only the boundaries directly involved in the failure path (e.g., Inbound Data, State, Execution, or Outbound DOM). Do not read or audit untouched layers.
   - **Defensive Resolution**: Implement explicit validation, type casting, timestamp concurrency checks (`updated_at`), and permanent architectural fixes (zero band-aids).

3. **Workspace Standards Compliance**:
   - Adhere to dual-key persistence and single-source-of-truth DOM management (`foolproof-architecture`).
   - Respect task scoping and stop-on-analysis directives (`strict-execution`).
   - Adhere to core non-negotiables: zero mock data, OCC on mutations, and RLS visibility awareness (`claude-tier-software-engineer`). Do not auto-read these skills unless specifically required.

