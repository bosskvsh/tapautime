-- Migration: 20260913000003_admin_orders_full_management.sql
-- Description: Grants full administrative CRUD access on public.orders for users with role 'admin'

-- 1. Drop existing SELECT-only policy for admins on public.orders if present
DROP POLICY IF EXISTS "Admins can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;

-- 2. Create full access policy (FOR ALL) for platform administrators
CREATE POLICY "Admins have full access to orders" 
ON public.orders 
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
