-- =============================================================================
-- Migration: Fix RLS Infinite Recursion Between Merchants and Users
-- Resolves PostgreSQL Error 42P17 by using SECURITY DEFINER helper functions
-- =============================================================================

-- 1. Helper function: check if authenticated user has admin role
-- Marked SECURITY DEFINER to bypass RLS recursion when queried inside table policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin'::user_role
  ) OR EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid() AND (
      email LIKE '%@tapautime.my' OR
      (raw_user_meta_data->>'role') = 'admin'
    )
  );
$$;

-- 2. Helper function: check if a customer has placed orders at the calling merchant's stall
-- Marked SECURITY DEFINER to bypass RLS recursion between users and merchants
CREATE OR REPLACE FUNCTION public.is_merchant_customer(customer_uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.merchants m ON (m.id::text = o.merchant_id OR m.owner_id::text = o.merchant_id)
    WHERE o.customer_id = customer_uid
      AND (m.owner_id = auth.uid() OR m.id = auth.uid())
  );
$$;

-- Grant execute permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_merchant_customer(uuid) TO authenticated, service_role;

-- 3. Update public.merchants admin policy
DROP POLICY IF EXISTS "Admins can update all merchants" ON public.merchants;
CREATE POLICY "Admins can update all merchants"
  ON public.merchants
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4. Update public.users merchant view policy
DROP POLICY IF EXISTS "Merchants view customer profiles for their orders" ON public.users;
CREATE POLICY "Merchants view customer profiles for their orders"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.is_merchant_customer(id));

-- 5. Update public.orders admin policy
DROP POLICY IF EXISTS "Admins have full access to orders" ON public.orders;
CREATE POLICY "Admins have full access to orders"
  ON public.orders
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 6. Update public.orders_v2 admin policy
DROP POLICY IF EXISTS "Admins have full access to orders_v2" ON public.orders_v2;
CREATE POLICY "Admins have full access to orders_v2"
  ON public.orders_v2
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. Update public.merchant_applications admin policy
DROP POLICY IF EXISTS "Admins can view and manage merchant applications" ON public.merchant_applications;
CREATE POLICY "Admins can view and manage merchant applications"
  ON public.merchant_applications
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8. Update public.payout_requests admin policy
DROP POLICY IF EXISTS "Admins can view and manage all payout requests" ON public.payout_requests;
CREATE POLICY "Admins can view and manage all payout requests"
  ON public.payout_requests
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 9. Update public.merchant_promo_codes admin policy
DROP POLICY IF EXISTS "Admins can read all promo code submissions" ON public.merchant_promo_codes;
CREATE POLICY "Admins can read all promo code submissions"
  ON public.merchant_promo_codes
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
