-- Allow anonymous dine-in cash orders securely
CREATE POLICY "Allow anonymous dine-in cash orders" 
ON public.orders 
FOR INSERT 
TO anon 
WITH CHECK (
  order_type = 'dine_in' AND 
  payment_method = 'cash' AND
  platform_fee = 0.00
);

-- Ensure a unique index exists on the merchants.slug column for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_slug ON public.merchants(slug);
