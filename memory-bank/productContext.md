# Product Context

## Why TapauTime Exists
Traditional kopitiams (food courts with many independent stalls) require customers to join a separate queue and wait at every stall. There was no cohesive ordering experience, no revenue-metering for hawkers, and no audit trail for the platform fee. TapauTime solves this with a single "order ahead from multiple stalls, one pickup point, one PIN" experience.

## Problems It Solves
1. **Multi-stall ordering friction:** One cart across many merchants → one `Master_Transaction` splits into per-merchant `Orders`, all collected with a single `pickup_pin`.
2. **Manual payment fraud:** DuitNow receipt uploads are compressed (<200KB), TTL'd (7 days), reviewed full-screen; gateway payments are HMAC-SHA256 server-verified; Cash on Collection is explicit.
3. **Internet instability:** Offline protection via heartbeat; React chill state over websockets; fallback fetches; stock reserved until checkout expiry (`stock_reserved_until`); Optimistic Concurrency Control (`WHERE status = previous_status`).
4. **Franchise menu drift:** `Menu_Items` resolves inheritance hierarchy — master (org) vs local (merchant) menus.
5. **No payout trust:** Immutable, double-entry `Ledger_Entries` (Credit Merchant Net / Debit Platform Fee) instead of summing `Orders`.

## How It Should Work
### Customer Flow
Browse a Hub → Filter by dietary macros → Add to Cart → Checkout (heartbeat validation, packaging fee calc) → Pay by DuitNow QR upload / Online Banking / Cash on Collection (or Curlec/Razorpay gateway) → Receive `pickup_pin` for tapau collection.

### Merchant Flow
Dashboard sends 60s heartbeats → Clean singleton audio alarm on new order → Full-screen receipt audit → Accept → Prepare → Ready → Handoff with PIN → Funds atomically logged to `Ledger_Entries`.

## UX Goals
- **Auntie-Proof merchant UI:** massive touch targets (min `h-16`), SwipeToConfirm for destructive actions, singleton audio alarm that never clips/frequency-drops, high-contrast styling.
- **Tactile validation on mobile web:** GSAP spring physics (`pointerdown` scale down / `pointerup` scale up with `back.out`) wrapped in `prefers-reduced-motion` checks.
- **Zero-latency state handoff:** known entities passed via state/props for immediate render; resilient background Supabase fetch syncs stale data.
- **Transparent pricing:** Subtotal, Packaging (CajBag), Platform Fee (waived for now), Total visible in Cart Drawer AND Checkout.
- **Agency-grade payment cards:** high-contrast DuitNow QR / Online Banking / Cash cards with active-state styling, copyable DuitNow details.
- **Pure takeaway discipline:** Customer PWA is strictly a Tapau (takeaway) product — all dine-in badges / table numbers / dine-in waivers removed and `orderType: 'dine_in'` purged from client storage via Zustand v2 schema migration.

---
*Source: `/root/prd.md`, `/root/CONTINUITY.md`*