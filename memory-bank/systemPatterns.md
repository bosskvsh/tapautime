# System Patterns

## Architecture at a Glance
- **Monorepo:** npm workspaces → `apps/customer-pwa` (React Vite PWA), `apps/merchant-web` (React Vite merchant dashboard), `packages/shared-ui` (100% pure/presentational UI kit, no business logic).
- **Backend:** Supabase — PostgreSQL 15+, PostgREST, Realtime, Storage, Auth, pg_cron, Edge Functions.
- **Payments:** Curlec/Razer (Razorpay two-legged pre-creation). Single robust Edge Function `checkout` creates the server order (`Math.round(total*100)` sen) → sets dynamic Razorpay PWA modal → `payment-webhook` function verifies HMAC-SHA256 signature and handles `payment.captured`.

## Key Technical Decisions (non-negotiable rules)
1. **Never bypass RLS.** Public/anon read-only menus/modifiers/merchants; order writes require `auth.uid() = customer_id`; merchant ops require `auth.uid() = merchants.owner_id`.
2. **Immutable fiat ledger:** payout never sums `Orders` traffic; on order completion, writes double-entry rows — Credit Merchant Net, Debit Platform Fee — atomically (stored procedure / trigger).
3. **Franchise inheritance:** `Menu_Items` may reference `org_id` (master) OR `merchant_id` (local); queries must resolve hierarchy.
4. **Macro metadata:** `{calories, protein}` in `nutritional_info` jsonb; a `tsvector`/RPC searches these dietary tags.
5. **Offline protection:** checkout raises hard-reject when `now() - merchants.last_seen > 2 minutes` fresh.
6. **Caj Bungkus (packaging):** computed dynamically from `merchants.packaging_fee_type` (fixed/percent), NOT baked in.
7. **Anti-fraud:** receipts compressed <200KB; buckets have 7-day TTL; full-screen receipt review modal before accept/decline.
8. **Multi-Tablet OCC:** status transitions use `UPDATE ... WHERE id = X AND status = 'previous_status'` — swallow 0-row results and reload.
9. **Auntie-Proof:** `<SwipeToConfirm>` for destructive actions; min touch target `h-16`; singleton `useAudioAlarm`.
10. **Money math:** only decimal/numeric (Postgres `numeric`) — never JS floats. Razorpay amounts in mental sen (`Math.round(total * 100)`).
11. **Shared UI:** anything new UI to `packages/shared-ui`, 100% presentational.

## Critical Architecture — Hub & Spoke Checkout
1. Edge Function `checkout` validates heartbeat; atomically reserves stock (`process_order_checkout` stored proc, `SELECT ... FOR UPDATE` row locks); writes `Master_Transactions` (1 `pickup_pin`) + N `Order_Items` for each merchant.
2. Payment leg resolves: gateway (Razorpay) or manual (DuitNow upload) both funnel to `payment_status`; webhook verifies signature and advances orders/events.
3. Powercompletion: `Ledger_Entries` written id greedily, `order_events` audit trail appended.

## Component Relationships
- **Stores:** Zustand holds cart (v2 schema, versioned to purge legacy dine_in state via migration), merchant session, live orders.
- **Hooks (singleton/global):** `useAudioAlarm` (singleton — no clipping), `useHeartbeat` (ping every 60s).
- **Shared Audio/CDN:** customers' `cartItems` hashing merges modifier IDs + free-text `specialInstructions` → stable `cartItemId`.
- **Realtime:** Supabase Realtime publications: `cart_items, menu_categories, menu_items, menu_item_modifiers, merchants, order_items, orders, orders_v2`.

## Critical Implementation Paths / Gotchas
- PostgREST PGRST201: multi-FK relations to same table (e.g., `item_id` + `linked_item_id`) must be relation-qualified (`table!fk_name(cols)`) — never bare.
- Realtime insert parent (orders) fires before child rows → always delayed retry (~500ms) + child-table listener to hydrate order_items.
- Normalize JSONB `selected_modifiers` defensively (strings, variant keys, comma lists).
- Never expose `ledger_entries` via direct RLS SELECT — expose through `SECURITY DEFINER` RPC receipts only.

---
*Sources: `/root/architectureessentials.md`, `/root/architecture.md`, `/root/cloud.md`, `/root/CONTINUITY.md`*