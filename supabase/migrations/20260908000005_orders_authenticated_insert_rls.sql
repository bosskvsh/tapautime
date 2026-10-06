-- =============================================================================
-- Migration: 20260908000005_orders_authenticated_insert_rls.sql
-- Description: Explicitly allows authenticated role to insert rows linked to auth.uid()
-- =============================================================================

-- 1. Ensure authenticated role can insert orders linked to their auth.uid()
DROP POLICY IF EXISTS "authenticated_customer_insert_orders" ON public.orders;
CREATE POLICY "authenticated_customer_insert_orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  customer_id = (SELECT auth.uid()) OR customer_id IS NULL
);

-- 2. Ensure authenticated role can select their own orders
DROP POLICY IF EXISTS "authenticated_customer_select_own_orders" ON public.orders;
CREATE POLICY "authenticated_customer_select_own_orders"
ON public.orders
FOR SELECT
TO authenticated
USING (
  customer_id = (SELECT auth.uid())
);
