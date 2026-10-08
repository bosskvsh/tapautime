-- =============================================================================
-- Migration: 20261007000002_update_active_promos_rpc_for_bundles.sql
-- Description:
--   Updates get_merchants_with_active_promos to include merchants
--   with active merchant_bundle_offers alongside active promo codes.
-- =============================================================================

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
    )
  UNION
  SELECT DISTINCT b.merchant_id
  FROM public.merchant_bundle_offers b
  WHERE b.is_active = true
    AND (p_merchant_ids IS NULL OR b.merchant_id = ANY(p_merchant_ids));
$$;

GRANT EXECUTE ON FUNCTION public.get_merchants_with_active_promos(UUID[]) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
