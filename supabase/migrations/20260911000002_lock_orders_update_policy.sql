-- Migration: Lock down orders update policy to prevent unauthenticated or cross-tenant payment spoofing
-- Replaces wide-open "Allow customer payment status update" (qual: true for anon & authenticated)
-- with a strictly bound policy ensuring customers can only mutate their own records.

DROP POLICY IF EXISTS "Allow customer payment status update" ON public.orders;

CREATE POLICY "customers_update_own_orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (customer_id = (SELECT auth.uid()))
WITH CHECK (customer_id = (SELECT auth.uid()));
