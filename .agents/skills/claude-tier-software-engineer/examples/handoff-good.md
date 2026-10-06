# Example: Correct Handoff (Critical Task)

**User task:** "Let customers cancel an order that hasn't been accepted yet."

## Classification (§0)

**Critical** — status transition affecting schema, RLS policy surface, the money/refund path, realtime listeners, and more than one file.

## 1. `<context_analysis>` (roughly 15 lines, no code dumps)

```xml
<context_analysis>
- Codebase Files & Schemas Inspected: supabase_architecture_v3_migration.sql (orders status enum),
  app.js order-status render path, packages/shared-ui (OrderStatusPill)
- Architecture & State Patterns: status is a Postgres enum; the UI derives pills from status;
  OCC (WHERE status = previous_status) is already used on the merchant "accepted" transition
- Boundary Hazards & Edge Cases Identified: double-cancel from two devices, cancel after the
  merchant already accepted, offline customer, attempting a refund row for an already-ledgered order
</context_analysis>
```

## 2. `<implementation_plan>`

```xml
<implementation_plan>
- Target Files: supabase_architecture_v3_migration.sql, app.js, packages/shared-ui/OrderStatusPill
- Logic & Architecture Changes:
  - Add a 'cancelled_by_customer' value to the orders status enum, plus an RLS UPDATE policy
    scoped to the row owner and to rows still in 'pending'
  - Cancel mutation uses OCC: UPDATE ... WHERE status = 'pending'
  - No payout or commission row is created for this transition; no float math anywhere
- Minimal Diff Scope: Only the customer-cancel path. No changes to accept/complete flows, no refactors.
</implementation_plan>
```

## 3. `<approval_request>` then STOP

```xml
<approval_request>
- Plan Summary: Add a customer-initiated cancel status with an OCC guard and owner-scoped RLS.
- Handoff Notice: "Does this plan look correct, or would you like to adjust the architecture before I write the code?"
</approval_request>
```

No file is touched until the user explicitly approves.

## 4. After approval: `<defensive_execution>`

Report implemented files, the defensive guards added (null-safety, the OCC predicate, disabled-button concurrency lock), and the completion status.

## 5. `<verification>` — required before saying "done"

```xml
<verification>
- Commands Run: node -c app.js -> exit 0, no syntax errors
- Changed vs. Approved Files: Match (3 of 3 approved targets)
- Unverified Surfaces: The RLS policy was not executed against a live database in this environment
</verification>
```

Note the last line. Admitting the unverified surface is part of the protocol, not a failure of it.
