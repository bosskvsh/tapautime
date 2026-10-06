# Example: Incorrect Deep Diagnosis — Do Not Do This

**User report:** "Sometimes the order list is empty on my phone, but the merchant dashboard shows the order."

## What went wrong

```text
I think this is probably a race condition in the state store. Let me just add a
retry and a timeout guard:

  setTimeout(() => fetchOrders(), 2000);
  if (!orders.length) orders = FALLBACK_ORDERS;

I also rewrote the subscription helper while I was in there, and bumped a couple
of unrelated deps. Try it now.
```

## Violations, one per rule

| Violation | Rule broken |
| :-- | :-- |
| No triage — the deep criteria were never assessed | §0 |
| "I think this is probably…" — patched before any evidence existed | §1, §2 |
| No `<context_gathering>`: the uuid-versus-number filter mismatch was never checked | §1 |
| A blind `setTimeout` workaround instead of the actual failure mechanism | §2, §6 (no band-aids) |
| `FALLBACK_ORDERS` injects synthetic data permanently into the shipped UI | §4 mock guard, §5, `no_mock_data.md` |
| Unrequested rewrite of the subscription helper | §6 Minimal Diff |
| "Bumped a couple of unrelated deps" | §6 Zero Dependency Creep, `strict-execution` §1 |
| No reproduction, no verification — yet declared resolved | §6 Mandatory Post-Fix Verification |
| Never stopped for authorization | §5 |

Note the shape of the failure: each individual line looks helpful, and together they make the bug harder to find while adding a new rule violation. `FALLBACK_ORDERS` is the worst of them — it would have hidden the empty state permanently, so the original bug could never have been diagnosed afterwards.

## The correct version

See `diagnosis-good.md` in this directory.
