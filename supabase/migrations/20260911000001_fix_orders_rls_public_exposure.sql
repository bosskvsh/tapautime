-- =============================================================================
-- Migration: 20260911000001_fix_orders_rls_public_exposure.sql
-- Description:
--   Remediates critical RLS security regression introduced in migration
--   20260908000004, where a SELECT policy with USING (true) was added for
--   both anon and authenticated roles, making every order in the database
--   publicly readable to any visitor without authentication.
--
--   Root cause: The permissive USING (true) policy overrides all narrower
--   policies because Postgres OR-combines permissive RLS policies.
--
--   Fix:
--   1. DROP the wide-open USING (true) policy.
--   2. DROP the duplicate policy added in 20260908000005 (conflicts resolved here).
--   3. REPLACE with a single, strict authenticated-only SELECT policy scoped
--      to customer_id = auth.uid() for customers.
--   4. Merchant SELECT policy (added in 20260908000002) is preserved as-is.
--   5. Anon SELECT is intentionally left with NO policy -- checkout requires
--      authentication (AuthModal gate), so anonymous order reads are not needed.
-- =============================================================================

-- 1. Drop the insecure USING (true) policy from migration 20260908000004
DROP POLICY IF EXISTS "Customers view their own orders" ON public.orders;

-- 2. Drop the duplicate from migration 20260908000005 (re-created cleanly below)
DROP POLICY IF EXISTS "authenticated_customer_select_own_orders" ON public.orders;

-- 3. Re-create a single, correct customer SELECT policy.
--    Customers may only read rows where they are the customer_id.
--    Uses (SELECT auth.uid()) subquery form for RLS initplan optimisation.
CREATE POLICY "customers_select_own_orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (customer_id = (SELECT auth.uid()));
