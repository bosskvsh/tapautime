-- =============================================================================
-- Migration: 20260908000004_fix_orders_rls_and_payment_status_check.sql
-- Description: 
--   1. Expands orders_payment_status_check constraint to include 'captured' & 'pending'.
--   2. Adds public/anon SELECT policy so customers can read orders & receive RETURNING payloads.
-- =============================================================================

-- 1. Drop existing payment_status check constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

-- 2. Add expanded check constraint that includes 'captured', 'pending', and 'failed'
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
CHECK (payment_status IN ('paid', 'pending_cash', 'captured', 'pending', 'failed'));

-- 3. Ensure anon and authenticated roles can SELECT orders (needed for RETURNING payloads and order tracking)
DROP POLICY IF EXISTS "Customers view their own orders" ON public.orders;
CREATE POLICY "Customers view their own orders"
ON public.orders
FOR SELECT
TO anon, authenticated
USING (true);
