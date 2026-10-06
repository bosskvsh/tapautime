-- Migration: 20260928000003_replace_active_promos_view_with_rpc.sql
-- Description:
--   Replaces the SECURITY DEFINER view public.merchant_active_promos with a secure
--   RPC function public.get_merchants_with_active_promos() with an explicit search_path
--   to resolve the Supabase Security Advisor CRITICAL warning.

-- 1. Drop the flagged view
DROP VIEW IF EXISTS public.merchant_active_promos CASCADE;

-- 2. Create the secure RPC function
CREATE OR REPLACE FUNCTION public.get_merchants_with_active_promos(p_merchant_ids UUID[] DEFAULT NULL)
RETURNS TABLE (merchant_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT DISTINCT p.merchant_id
  FROM public.merchant_promo_codes p
  WHERE p.status = 'active'
    AND (p_merchant_ids IS NULL OR p.merchant_id = ANY(p_merchant_ids))
    AND (
      (p.duration_type = 'expiration' AND (p.expiration_date IS NULL OR p.expiration_date >= CURRENT_DATE))
      OR (p.duration_type = 'usage_limit' AND (p.max_uses IS NULL OR p.used_count < p.max_uses))
      OR (p.duration_type IS NULL)
    );
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_merchants_with_active_promos(UUID[]) TO anon, authenticated, service_role;

-- 4. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
