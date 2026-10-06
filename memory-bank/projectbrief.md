# Project Brief — TapauTime

## Project Name
**TapauTime** — Kopitiam Multi-Merchant Micro-Takeaway PWA ("Tapau Time").

## One-Line Mission
A Progressive Web App for the Southeast Asian F&B ecosystem that lets customers pre-order takeaway ("tapau") from multiple stalls inside one kopitiam under a single checkout, while giving merchants Auntie-proof order-management tools and a bulletproof, auditable payout ledger.

## Scope
Scales from chaotic multi-stall kopitiams (Hub & Spoke) up to multi-outlet regional franchises (Organizational Menu Inheritance).

### MVP Features
1. **Ecosystem Architecture:** Hub & Spoke for kopitiams (one `Master_Transaction` + one `pickup_pin` splits into multiple `Orders`); Organizational inheritance for franchise master/local menus.
2. **Immutable Fiat Ledger:** Double-entry `Ledger_Entries` — Credit Merchant Net + Debit Platform Fee — written atomically on order completion. Never sum `Orders` for payouts.
3. **Bulletproof Operations:** 60s merchant heartbeats with checkout hard-reject if `now() - last_seen > 2 minutes`, Surge Mode ETAs, Jade ribbons, and Auntie-Proof UI (singleton audio alarms, ≥`h-16` touch targets, SwipeToConfirm destructive actions).
4. **Payment Realities:** Mixed payment methods — DuitNow QR receipt upload (anti-fraud compressed <200KB, 7-day TTL buckets, full-screen review), Online Banking, Cash on Collection, and Curlec (Razorpay) gateway with HMAC-verified webhooks.

## Target Audience
- **Customers:** Busy individuals (incl. macro-tracking health-conscious users) who want to order ahead from multiple stalls under one roof without queueing.
- **Merchants:** Independent hawkers (need Auntie-proof tools) and franchise operators (centralized menu management across outlets).

## Key Documents That Govern This Project
- `master_agent_instructions.md` — non-negotiable engineering rules for agents.
- `architectureessentials.md` — TL;DR operational/financial/UI rules (always check first).
- `cloud.md` — Supabase architecture details.
- `architecture.md` — technical architecture and data models.
- `CONTINUITY.md` — engineering continuity + gate tracker + session memory / bug tracker.

## Success Criteria (Current Phase)
Curlec (Razorpay) gateway integration verified end-to-end and pure-takeaway alignment complete with cent percent-clean production builds (`npm run build` passes).

## Location
Working dir: `c:\Users\cleve\OneDrive\Desktop\tapau time` — npm monorepo (`apps/*`, `packages/*`), plus `supabase/` for Edge Functions and migrations.

---
*Source: `/root/prd.md`, `/root/CONTINUITY.md`, `/root/architectureessentials.md`*