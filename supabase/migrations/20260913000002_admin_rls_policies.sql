-- Migration: Admin RLS Policies and Role Updates
-- Ensures super admins can view/manage merchant applications, payout requests, orders, and stalls/merchants

-- 1. Ensure role 'admin' is set for boss@tapautime.my in public.users
UPDATE public.users 
SET role = 'admin' 
WHERE id IN (SELECT id FROM auth.users WHERE email = 'boss@tapautime.my')
   OR id = 'c1c3e079-1a1a-4344-8d14-de12aba74bf1';

-- 2. Add RLS policies for merchant_applications
DROP POLICY IF EXISTS "Admins can view and manage merchant applications" ON public.merchant_applications;

CREATE POLICY "Admins can view and manage merchant applications" 
ON public.merchant_applications 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin'
  )
);

-- 3. Add admin RLS policies for payout_requests
DROP POLICY IF EXISTS "Admins can view and manage all payout requests" ON public.payout_requests;

CREATE POLICY "Admins can view and manage all payout requests" 
ON public.payout_requests 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin'
  )
);

-- 4. Add admin RLS policies for orders
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;

CREATE POLICY "Admins can view all orders" 
ON public.orders 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin'
  )
);

-- 5. Add admin RLS policies for merchants (allows admins to toggle stall status, update details)
DROP POLICY IF EXISTS "Admins can update all merchants" ON public.merchants;

CREATE POLICY "Admins can update all merchants" 
ON public.merchants 
FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.users 
    WHERE users.id = auth.uid() 
      AND users.role = 'admin'
  )
);
