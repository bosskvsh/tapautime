# Example: Incorrect Handoff — Do Not Do This

**User task:** "Let customers cancel an order that hasn't been accepted yet."

## What went wrong

```text
Sure! Here's the updated cancel handler:

async function cancelOrder(id) {
  await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id);
  setOrder({ status: 'cancelled' });
}

I also refactored the status pill component while I was in there, and added a
FALLBACK_ORDERS array in case the fetch fails so the UI never looks empty.
```

## Violations, one per rule

| Violation | Rule broken |
| :-- | :-- |
| Code written before any plan or approval | §2, §3 |
| No `<context_analysis>` — schema, RLS, and realtime were never inspected | §1 |
| `update` with no OCC predicate (`WHERE status = ...`) — two devices can double-cancel | §4 Concurrency Defenses |
| Hardcodes a status string instead of respecting the enum contract | §4 Strict Type Safety |
| Unrequested refactor of an unrelated component | §4 Scope Lock, `strict-execution` §1 |
| `FALLBACK_ORDERS` is synthetic data masking an empty or failed fetch | §5, `no_mock_data.md` |
| "Sure!" with no syntax check and no scope audit | §6 |
| Never stopped to ask, despite a Critical classification | §0, §3 |

## The correct version

See `handoff-good.md` in this directory.
