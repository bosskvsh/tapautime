-- Migration: 20260908000003_curlec_payment_capture_rls_and_realtime.sql
-- Description: Add curlec_payment_id to orders, set REPLICA IDENTITY FULL, and enable customer/anon payment status updates.

-- 1. Add curlec_payment_id column to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS curlec_payment_id TEXT;

-- 2. Ensure REPLICA IDENTITY is FULL so Realtime UPDATE events include merchant_id and all attributes
ALTER TABLE public.orders REPLICA IDENTITY FULL;

-- 3. Ensure orders is in supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

-- 4. Allow authenticated and anon roles to update payment status upon gateway completion
DROP POLICY IF EXISTS "Allow customer payment status update" ON public.orders;
CREATE POLICY "Allow customer payment status update"
ON public.orders
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (
  payment_status IN ('captured', 'paid', 'pending', 'pending_cash', 'failed')
);
