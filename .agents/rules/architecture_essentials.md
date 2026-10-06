# Architecture Essentials - TL;DR for Agent Reference

*   **Stack:** React PWA, React Web, Supabase. NEVER bypass RLS. 

*   **Critical Operational Rules (MUST FOLLOW):**
    1.  **Immutable Fiat Ledger:** Never rely on summing `Orders` for payouts. On order completion, write double-entry rows to `Ledger_Entries` (Credit Merchant Net, Debit Platform Fee).
    2.  **Franchise Inheritance:** `Menu_Items` can belong to an `Organization` (master menu) or a `Merchant` (local menu). Queries must resolve this hierarchy.
    3.  **Macro Metadata:** Inject `{calories, protein}` into `nutritional_info` jsonb. Update `tsvector` RPC to search these dietary tags.
    4.  **Singleton Audio:** The `useAudioAlarm` hook MUST use a singleton pattern. Multiple orders cannot trigger overlapping/clipping audio tracks.
    5.  **Offline Protection:** Checkout Edge Function MUST hard-reject if `now() - Merchants.last_seen > 2 minutes`.
    6.  **Caj Bungkus:** Calculate packaging dynamically based on `packaging_fee_type`.
    7.  **Anti-Fraud:** Compress receipts <200KB. 7-day TTL on buckets. Full-screen receipt review modal.
    8.  **Hub & Spoke:** `Master_Transaction` (with 1 `pickup_pin`) splits into multiple `Orders`.
    9.  **Auntie-Proof UI:** `<SwipeToConfirm>` for destructive actions. Minimum touch target `h-16`.
    10. **Multi-Tablet OCC:** Status updates MUST use `UPDATE... WHERE id = X AND status = 'pending'`.
