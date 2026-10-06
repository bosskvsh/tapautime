-- =============================================================================
-- Migration: Allow Merchants to View Customer Profiles For Their Orders
-- & Ensure Orders Have customer_name and customer_phone Columns
-- =============================================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Backfill from public.users if customer_name or customer_phone is null
UPDATE public.orders 
SET customer_name = COALESCE(public.orders.customer_name, users.name),
    customer_phone = COALESCE(public.orders.customer_phone, users.phone)
FROM public.users 
WHERE public.orders.customer_id = users.id
  AND (public.orders.customer_name IS NULL OR public.orders.customer_phone IS NULL);

-- Allow authenticated merchants to read profiles of users who placed orders at their store
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'users' AND policyname = 'Merchants view customer profiles for their orders'
  ) THEN
    CREATE POLICY "Merchants view customer profiles for their orders"
      ON public.users
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          JOIN public.merchants m ON m.id::text = o.merchant_id
          WHERE o.customer_id = users.id
            AND m.owner_id = (SELECT auth.uid())
        )
      );
  END IF;
END $$;
