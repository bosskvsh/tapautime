# Progress

## Status Summary
**Phase: Gate 4 — Execution & Verification Complete.**
Curlec (Razorpay) gateway integration + pure-takeaway alignment shipped and verified; production builds green.

## What Works (Verified)
- ✅ Supabase Edge Function `checkout` — server-side Razorpay order pre-creation (sen), heartbeat validation, stock reservation via atomic stored proc with row locks.
- ✅ Razorpay PWA modal integration (`checkout.razorpay.com` dynamic load, `#f97316` branding).
- ✅ `payment-webhook` — HMAC-SHA256 signature verification + `payment.captured` handling + audit trail.
- ✅ Pure Tapau alignment — dine-in elements removed from `CartDrawer.tsx` / `CheckoutScreen.tsx`; Zustand v2 schema migration purges legacy `orderType: 'dine_in'`.
- ✅ RLS across tables; OCC status transitions; `Ledger_Entries` double-entry payout pattern.
- ✅ Auntie-proof foundations: singleton `useAudioAlarm`, `useHeartbeat` (60s), SwipeToConfirm, h-16 targets.
- ✅ Playwright test harness wired (`npm test`).

## What's Left to Build (Next Gate)
- [ ] Cart Drawer modernization: swipe-to-delete, 44px+ trash confirmation, jumbo steppers.
- [ ] Transparent cost breakdown (Subtotal / Packaging / Platform Fee Waived / Total) in Cart Drawer AND Checkout.
- [ ] Full order review list on Checkout Screen (dishes, modifiers, notes visible pre-payment).
- [ ] Agency-grade payment method cards (DuitNow QR / Online Banking / Cash on Collection) with copyable DuitNow details + receipt upload drag/tap.
- [ ] Sticky high-contrast "Place Order" action bar with safe-area padding + spring physics.
- [ ] Push any extracted UI into `packages/shared-ui` (pure/presentational).

## Known Issues / Risks
- Realtime parent/child insert races (mitigated: 500ms retry + child listener).
- Websocket drops on mobile (mitigated: fallback fetches).
- PostgREST PGRST201 on multi-FK relations (mitigated: relation-qualified selects).
- Legacy root-level `app.js`/`server.js`/`index.html` demo layer coexists with monorepo apps — do not confuse during refactors.
- `.env` values not committed; `.env.example` is the contract.

## Evolution of Decisions
1. Dine-in + tapau toggle → **pure takeaway only** (all dine-in UI sanitized; client storage migrated).
2. Manual-only payments → **hybrid**: Curlec/Razorpay gateway + DuitNow receipt upload + Online Banking + Cash on Collection.
3. Root single-file demo (`app.js`) → **npm workspace monorepo** (`apps/*`, `packages/*`) as the source of truth.