# Cloud & Backend Architecture: Supabase

## 1. Overview
* **Platform:** Supabase (PostgreSQL 15+, Auth, Edge Functions, Realtime, Storage).
* **Project ID:** `iaqohdvdebgxtfbxijsw`
* **Realtime Publications:** `cart_items`, `menu_categories`, `menu_items`, `menu_item_modifiers`, `merchants`, `order_items`, `orders`, `orders_v2`.

## 2. Row Level Security (RLS) Policies
* RLS is strictly enabled across all tables.
* Public/anon clients can read active merchants, available menu items, and modifiers.
* Write operations on `orders` and `order_items` require authenticated customer context (`auth.uid() = customer_id`).
* Merchant operations (accept, prepare, ready, complete) are restricted to merchant owners (`auth.uid() = merchants.owner_id`).

## 3. Data Integrity & Concurrency
* **Stock & Inventory:** Managed via atomic PostgreSQL stored procedures (`process_order_checkout`) with row-level locks (`SELECT ... FOR UPDATE`) to prevent race conditions during high-volume sales.
* **Structured Modifiers:** Custom orders use `menu_item_modifiers` foreign keys and structured JSON snapshots in `order_items.selected_modifiers`. Free-text requests are never used for pricing or inventory.

## 4. Edge Functions & Webhooks
* Edge Functions handle external payment gateway callbacks (Touch 'n Go, DuitNow, FPX, Stripe).
* Webhook endpoints verify signatures, update `orders.payment_status`, advance `orders.order_status`, and log audit trails to `order_events`.
