# Example: Correct Deep Diagnosis (Token-Optimized)

**User report:** "Sometimes the order list is empty on my phone, but the merchant dashboard shows the order."

## Turn 1: Evidence & Compact Diagnosis

```xml
<deep_diagnosis>
- Evidence Inspected: app.js (order list render + realtime channel setup), orders SELECT policy in migrations, sw.js
- Root Cause Mechanism: The realtime filter compares a numeric order ID against a UUID column, preventing the subscription from ever receiving events. The UI renders an empty state with no error.
- Active Boundaries: Consumer UI ↔ Realtime WebSocket ↔ Postgres RLS
- Reproduction Sequence: Place an order from client A, observe client B never receives the INSERT frame on the channel.
- Blast Radius: Critical (touches realtime subscription filters and orders visibility; user approval required)
- Action Plan / Handoff: Correct filter type cast in app.js and verify subscription payload. Please authorize proceeding with this fix.
</deep_diagnosis>
```

---

## Turn 2: Verified Resolution (Post-Approval)

```xml
<resolution_audit>
- Applied Changes: app.js:142-148: Ensured filter compares UUID string representation and added null-safe fallback.
- Verification Executed: node -c app.js -> exit 0; two-device test confirmed client B receives the INSERT frame.
- Regression Sweep: Verified merchant KDS subscription filter continues to receive order updates.
- Unverified Surfaces: Offline reconnection stream could not be exercised in this local environment.
</resolution_audit>
```
