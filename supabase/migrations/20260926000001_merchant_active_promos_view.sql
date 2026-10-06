-- Migration: 20260926000001_merchant_active_promos_view.sql
-- Description:
--   Exposes a lightweight, public view for customer-facing clients
--   to identify which merchants currently have at least one active, valid promo code.
--   This does not leak private promo code strings, usage counts, or discount terms.

CREATE OR REPLACE VIEW public.merchant_active_promos AS
SELECT DISTINCT merchant_id
FROM public.merchant_promo_codes
WHERE status = 'active'
  AND (
    (duration_type = 'expiration' AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE))
    OR (duration_type = 'usage_limit' AND (max_uses IS NULL OR used_count < max_uses))
    OR (duration_type IS NULL)
  );

GRANT SELECT ON public.merchant_active_promos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
