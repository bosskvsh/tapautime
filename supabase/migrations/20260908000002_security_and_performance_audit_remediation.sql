-- Migration: 20260908000002_security_and_performance_audit_remediation.sql
-- Description: Remediates vulnerabilities and performance bottlenecks identified by Supabase Advisors,
--              including function search_path hardening, trigger function execution revocation,
--              realtime REPLICA IDENTITY FULL configuration, order_events publication,
--              covering foreign key indexes, and RLS initplan optimizations.

-- =============================================================================
-- 1. HARDEN FUNCTION SEARCH_PATH
-- =============================================================================
ALTER FUNCTION public.auto_confirm_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.process_order_event_state_transition() SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_order_occ_version() SET search_path = public, pg_temp;
ALTER FUNCTION public.enforce_ledger_immutability() SET search_path = public, pg_temp;
ALTER FUNCTION public.search_menu_items(uuid, uuid, text, numeric, numeric, text[]) SET search_path = public, pg_temp;
ALTER FUNCTION public.process_order_checkout(uuid, uuid, jsonb, numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_order_completed_ledger() SET search_path = public, pg_temp;
ALTER FUNCTION public.checkout_atomic_reservation(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.release_atomic_reservation(jsonb) SET search_path = public, pg_temp;

-- =============================================================================
-- 2. REVOKE EXECUTE ON INTERNAL TRIGGER / ADMIN FUNCTIONS
-- =============================================================================
REVOKE EXECUTE ON FUNCTION public.auto_confirm_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_order_completed_ledger() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_order_event_state_transition() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_order_occ_version() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ledger_immutability() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM public, anon, authenticated;

-- =============================================================================
-- 3. REPLICA IDENTITY FULL & REALTIME PUBLICATION
-- =============================================================================
ALTER TABLE public.orders_v2 REPLICA IDENTITY FULL;
ALTER TABLE public.master_transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;
  END IF;
END $$;

-- =============================================================================
-- 4. MISSING COVERING FOREIGN KEY INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_ledger_entries_order_id ON public.ledger_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_linked_item_id ON public.menu_item_modifiers(linked_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_org_id ON public.menu_items(org_id);
CREATE INDEX IF NOT EXISTS idx_merchants_owner_id ON public.merchants(owner_id);
CREATE INDEX IF NOT EXISTS idx_order_items_item_id ON public.order_items(item_id);

-- =============================================================================
-- 5. USERS & LEADS RLS HARDENING
-- =============================================================================
DROP POLICY IF EXISTS "Public can view basic user info" ON public.users;
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Allow public lead selects" ON public.tapautime_leads;

-- =============================================================================
-- 6. ORDERS_V2 & ORDER_EVENTS RLS
-- =============================================================================
DROP POLICY IF EXISTS "Allow public orders_v2 select" ON public.orders_v2;
DROP POLICY IF EXISTS "Allow public orders_v2 update" ON public.orders_v2;

CREATE POLICY "Merchants view own orders_v2"
  ON public.orders_v2
  FOR SELECT
  TO authenticated
  USING (
    merchant_id IN (
      SELECT (id)::text FROM public.merchants WHERE owner_id = (SELECT auth.uid())
      UNION
      SELECT (store_id)::text FROM public.merchant_profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Customers view own orders_v2"
  ON public.orders_v2
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

CREATE POLICY "Merchants update own orders_v2"
  ON public.orders_v2
  FOR UPDATE
  TO authenticated
  USING (
    merchant_id IN (
      SELECT (id)::text FROM public.merchants WHERE owner_id = (SELECT auth.uid())
      UNION
      SELECT (store_id)::text FROM public.merchant_profiles WHERE id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    merchant_id IN (
      SELECT (id)::text FROM public.merchants WHERE owner_id = (SELECT auth.uid())
      UNION
      SELECT (store_id)::text FROM public.merchant_profiles WHERE id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Allow public order_events select" ON public.order_events;
CREATE POLICY "Merchants and customers view order_events"
  ON public.order_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders_v2 o
      WHERE o.id = order_events.order_id
        AND (
          o.customer_id = (SELECT auth.uid())
          OR o.merchant_id IN (
            SELECT (id)::text FROM public.merchants WHERE owner_id = (SELECT auth.uid())
            UNION
            SELECT (store_id)::text FROM public.merchant_profiles WHERE id = (SELECT auth.uid())
          )
        )
    )
  );

-- =============================================================================
-- 7. LEGACY ORDERS TABLE RLS
-- =============================================================================
DROP POLICY IF EXISTS "orders_merchant_all" ON public.orders;
DROP POLICY IF EXISTS "orders_public_select" ON public.orders;
DROP POLICY IF EXISTS "orders_merchant_select" ON public.orders;
DROP POLICY IF EXISTS "Merchants can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Merchants can update their own orders" ON public.orders;

CREATE POLICY "Merchants can view their own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    merchant_id IN (
      SELECT (merchants.id)::text FROM public.merchants WHERE merchants.owner_id = (SELECT auth.uid())
      UNION
      SELECT (store_id)::text FROM public.merchant_profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Merchants can update their own orders"
  ON public.orders
  FOR UPDATE
  TO authenticated
  USING (
    merchant_id IN (
      SELECT (merchants.id)::text FROM public.merchants WHERE merchants.owner_id = (SELECT auth.uid())
      UNION
      SELECT (store_id)::text FROM public.merchant_profiles WHERE id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Customers view their own orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

-- =============================================================================
-- 8. MASTER TRANSACTIONS & INITPLAN OPTIMIZATIONS
-- =============================================================================
DROP POLICY IF EXISTS "Customers read own transactions" ON public.master_transactions;
CREATE POLICY "Customers read own transactions"
  ON public.master_transactions
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Customers create transactions" ON public.master_transactions;
CREATE POLICY "Customers create transactions"
  ON public.master_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (customer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Merchants can view transactions for their orders" ON public.master_transactions;
CREATE POLICY "Merchants can view transactions for their orders"
  ON public.master_transactions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      JOIN public.merchants m ON m.id::text = o.merchant_id
      WHERE o.transaction_id = master_transactions.id
        AND m.owner_id = (SELECT auth.uid())
    )
  );

-- =============================================================================
-- 9. CART ITEMS INITPLAN OPTIMIZATION
-- =============================================================================
DROP POLICY IF EXISTS "cart_items_select" ON public.cart_items;
CREATE POLICY "cart_items_select" ON public.cart_items FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "cart_items_insert" ON public.cart_items;
CREATE POLICY "cart_items_insert" ON public.cart_items FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "cart_items_update" ON public.cart_items;
CREATE POLICY "cart_items_update" ON public.cart_items FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "cart_items_delete" ON public.cart_items;
CREATE POLICY "cart_items_delete" ON public.cart_items FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

-- =============================================================================
-- 10. MERCHANT PAYMENT SETTINGS & PROFILES INITPLAN OPTIMIZATION
-- =============================================================================
DROP POLICY IF EXISTS "Merchants can view own payment settings" ON public.merchant_payment_settings;
CREATE POLICY "Merchants can view own payment settings" ON public.merchant_payment_settings FOR SELECT TO authenticated USING (merchant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Merchants can insert own payment settings" ON public.merchant_payment_settings;
CREATE POLICY "Merchants can insert own payment settings" ON public.merchant_payment_settings FOR INSERT TO authenticated WITH CHECK (merchant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Merchants can update own payment settings" ON public.merchant_payment_settings;
CREATE POLICY "Merchants can update own payment settings" ON public.merchant_payment_settings FOR UPDATE TO authenticated USING (merchant_id = (SELECT auth.uid())) WITH CHECK (merchant_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "merchant_profiles_select" ON public.merchant_profiles;
CREATE POLICY "merchant_profiles_select" ON public.merchant_profiles FOR SELECT TO authenticated USING (id = (SELECT auth.uid()) OR store_id = (SELECT get_auth_store_id()));

DROP POLICY IF EXISTS "merchant_profiles_update" ON public.merchant_profiles;
CREATE POLICY "merchant_profiles_update" ON public.merchant_profiles FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()));

-- =============================================================================
-- 11. DROP DUPLICATE INDEX ON ORDER_ITEMS & REMAINING INITPLANS
-- =============================================================================
DROP INDEX IF EXISTS public.idx_order_items_order;

DROP POLICY IF EXISTS "Owners can manage merchant" ON public.merchants;
CREATE POLICY "Owners can manage merchant"
  ON public.merchants
  FOR ALL
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Merchants read own ledger" ON public.ledger_entries;
CREATE POLICY "Merchants read own ledger"
  ON public.ledger_entries
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants
      WHERE merchants.id = ledger_entries.merchant_id
        AND merchants.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "menu_items_manage" ON public.menu_items;
CREATE POLICY "menu_items_manage"
  ON public.menu_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.merchants
      WHERE merchants.id = menu_items.merchant_id
        AND merchants.owner_id = (SELECT auth.uid())
    )
  );

