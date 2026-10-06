-- =============================================================================
-- Migration: 20260909000002_add_pending_payment_status_and_gateway_method.sql
-- Description: Expand order_status enum to include 'pending_payment' and
--              update orders_payment_method_check to permit 'gateway' & 'manual_transfer'
-- =============================================================================

-- 1. Add 'pending_payment' to order_status enum if not present
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumtypid = 'public.order_status'::regtype 
      AND enumlabel = 'pending_payment'
  ) THEN
    ALTER TYPE public.order_status ADD VALUE 'pending_payment';
  END IF;
END $$;

-- 2. Expand orders_payment_method_check constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check 
CHECK (payment_method IS NULL OR payment_method IN ('online', 'cash', 'gateway', 'manual_transfer'));

-- 3. Ensure RLS allows updating status from pending_payment to accepted upon capture
DROP POLICY IF EXISTS "Allow customer payment status update" ON public.orders;
CREATE POLICY "Allow customer payment status update"
ON public.orders
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (
  payment_status IN ('captured', 'paid', 'pending', 'pending_cash', 'failed')
);
