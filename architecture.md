# Technical Architecture: TapauTime

## 1. Tech Stack
*   **Customer PWA / Merchant Web:** React (Vite), Tailwind CSS, Zustand, Workbox.
*   **Backend & DB:** Supabase (PostgreSQL, Edge Functions, pg_cron, Storage).

## 2. Data Models (Supabase/PostgreSQL)

**Organizations, Hubs & Merchants**
*   `Organizations`: `id` (uuid, PK), `name` (For multi-outlet franchises)
*   `Parent_Hubs`: `id` (uuid, PK), `name`, `location`
*   `Merchants`: `id`, `hub_id`, `org_id` (uuid, FK), `business_name`, `last_seen`, `packaging_fee_type`, `packaging_fee_amount`

**Menu, Modifiers & Ledger**
*   `Menu_Items`: `id`, `org_id` (Master) OR `merchant_id` (Local), `name`, `price`, `stock_quantity`, `nutritional_info` (jsonb), `search_tags` (text[])
*   `Menu_Item_Modifiers`: `id`, `item_id`, `modifier_group`, `option_name`, `additional_price`, `linked_item_id`, `nutritional_info`
*   `Ledger_Entries`: `id`, `transaction_id`, `merchant_id` (uuid, FK), `type` (enum: credit, debit), `amount` (numeric), `description` (text), `created_at`

**Transactions & Orders**
*   `Master_Transactions`: `id`, `customer_id`, `total_amount`, `payment_method`, `payment_status`, `receipt_url`, `pickup_pin`
*   `Orders`: `id`, `transaction_id`, `merchant_id`, `idempotency_key`, `order_status`, `stock_reserved_until`, `packaging_fee_charged`
*   `Order_Items`: `id`, `order_id`, `item_id`, `quantity`, `selected_modifiers`
