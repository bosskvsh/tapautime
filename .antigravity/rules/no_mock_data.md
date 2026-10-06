# Strict Rule: Absolute Prohibition of Mock Data

- **Zero Mock / Dummy Data**: NEVER insert mock, dummy, synthetic, or hardcoded sample data (e.g., mock menu items, sample hawker stalls, fake orders, sample transactions, or mock hardware devices) into any client UI, state stores, screens, or components.
- **Pure Database Single Source of Truth**:
  - All state hooks and store definitions (`useState`, Zustand stores, etc.) must initialize strictly to empty collections (`[]`), null, or empty strings (`''`).
  - When an API or Supabase query returns 0 rows (`data.length === 0`), the application must strictly preserve the empty set and render an authentic empty state UI (e.g., "No items found", "No stalls available").
  - NEVER provide fallback mock constants (e.g., `FALLBACK_MENU`, `mockMerchants`, `sampleOrders`) to substitute for empty database responses or fetch errors.
  - Errors and network failures must be handled cleanly via error states or empty displays—never by falling back to fake/demo records.
- **Zero Hardcoded Entity Fallbacks**: NEVER hardcode default merchant IDs, stall UUIDs, customer UUIDs, or mock credentials as fallbacks in screens, payment flows, or checkout functions.
