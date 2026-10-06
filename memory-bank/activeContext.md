# Active Context

## Current Phase
**Gate 4 — Execution & Verification COMPLETE.** Curlec (Razorpay) Gateway Integration + Pure Takeaway (Tapau) Alignment. Status: Complete — build passing, `checkout` edge function + Razorpay PWA modal active, dine-in elements sanitized.

## Recent Changes (from CONTINUITY.md)
- **Curlec two-legged pre-creation:** Supabase Edge Function `checkout` creates server-side order at `api.razorpay.com/v1/orders` in sen (`Math.round(totalAmount*100)`).
- **Razorpay modal:** PWA dynamically loads `checkout.razorpay.com/v1/checkout.js`, instantiates modal with `#f97316` brand styling.
- **Webhook:** `payment-webhook` verifies HMAC-SHA256 (`x-razorpay-signature`), handles `payment.captured`, advances orders + audit trail.
- **Pure takeaway alignment:** removed dine-in badges/table numbers/waivers from `CartDrawer.tsx` & `CheckoutScreen.tsx`; Zustand `version: 2` migration purges legacy `orderType: 'dine_in'` from localStorage.

## Next Steps / Open Work
1. **Modernize ordering checkout loop** across `apps/customer-pwa/src/components/CartDrawer.tsx` and `apps/customer-pwa/src/screens/CheckoutScreen.tsx`:
   - Auntie-proof item management: swipe-to-delete gesture, direct 44px+ trash confirmation, jumbo steppers.
   - Transparent cost breakdown in Cart Drawer AND Checkout (Subtotal, Packaging, Platform Fee Waived, Total).
   - Comprehensive order review on Checkout (customer currently cannot see ordered dishes before locking payment).
   - Agency-grade payment method cards (DuitNow QR, Online Banking, Cash on Collection) with active states + copyable DuitNow details + upload drag/tap.
   - Sticky high-contrast "Place Order" action bar with safe-area bottom padding + spring physics.
2. Keep any new UI pure → `packages/shared-ui`.

## Active Decisions
- Customer PWA is strictly takeaway-only (no dine-in path).
- Packaging fee is dynamic (`packaging_fee_type`), platform fee currently waived.
- Gateway + manual receipt + cash are all first-class payment legs.

## Patterns & Preferences
- Data-flow-first feature design: Database → Edge Function → State → UI (per `agent_directives.md`).
- Tactile GSAP spring physics on interactive cards/buttons, gated by `prefers-reduced-motion`.
- Zero-latency state handoff on navigation (pass entity via props; background fetch syncs).
- OCC on every status write; no silent failures (`if (error) console.error(...)` always precedes data checks).

## Session Memory / Bug Tracker (learnings to preserve)
- [2026-09-06] **Network Tab Privacy:** Never give customers direct RLS `SELECT` on `ledger_entries` — use `SECURITY DEFINER` RPC for receipts.
- [2026-09-06] **Websocket Drop Resiliency:** mobile PWAs drop sockets; always fallback fetch `onMount` + within polling interval.
- [2026-09-06] **Relational Realtime Races:** parent `orders` INSERT precedes child `order_items`; use ~500ms delayed retry + child-table listener.
- [2026-09-06] **Defensive JSONB Normalization:** never assume modifier payload schema; normalize raw strings, variant keys, comma lists.
- [2026-09-07] **Zero-Latency State Handoff:** pass known entity via state/props; background Supabase fetch syncs; never block on spinner if partial data exists.
- [2026-09-07] **Auntie-Proof Tactile Feedback:** GSAP `pointerdown`/`pointerup` spring physics on cards/buttons; always `prefers-reduced-motion` guard.
- [2026-09-07] **PGRST201 Ambiguous FKs:** qualify multi-FK relations (`table!fk_name(cols)`).
- [2026-09-07] **No Silent Failures:** explicit `if (error) console.error(...)` before evaluating data.
- [2026-09-07] **Fallback Modifiers + Cart Hashing:** domain-specific fallback presets (Ice & Sugar for drinks; Spiciness & Sambal for noodles/rice); hash special instructions into `cartItemId` to avoid collisions.
- [2026-09-07] **Smart Fallback Presets:** UI must not collapse when DB relations are empty — localized presets keep layouts testable.
- [2026-09-07] **Scoped Bottom Sheet Drags:** scope drag-to-dismiss to grab handle + static header; preserve momentum scrolling inside lists.
- [2026-09-07] **Rubber-Band Pull-to-Refresh:** log-damped (`Math.pow(deltaY, 0.85)*1.5`, capped), gated to `window.scrollY <= 0`, suppressed during modals/drawers, min 450ms spinner.

## Important
- Always re-read `architectureessentials.md` + `CONTINUITY.md` before touching checkout/payments.
- Build must stay 100% clean (`npm run build`).