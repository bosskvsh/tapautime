-- =============================================================================
-- Migration: 20260925000004_merchant_promo_discounts.sql
-- Description:
--   Adds merchant-submitted RM/percentage promo terms and server-side redemption.
-- =============================================================================

ALTER TABLE public.merchant_promo_codes
  ADD COLUMN IF NOT EXISTS discount_type TEXT,
  ADD COLUMN IF NOT EXISTS discount_value NUMERIC(10, 2);

ALTER TABLE public.merchant_promo_codes
  DROP CONSTRAINT IF EXISTS merchant_promo_codes_discount_terms;

ALTER TABLE public.merchant_promo_codes
  ADD CONSTRAINT merchant_promo_codes_discount_terms CHECK (
    (discount_type IS NULL AND discount_value IS NULL)
    OR (discount_type = 'fixed' AND discount_value IS NOT NULL AND discount_value > 0)
    OR (discount_type = 'percentage' AND discount_value IS NOT NULL AND discount_value > 0 AND discount_value <= 100)
  );

-- New submissions must include valid terms. Existing code-only rows remain readable
-- for audit purposes, but cannot be activated without resubmission.
DROP POLICY IF EXISTS "Merchants can submit own promo code requests" ON public.merchant_promo_codes;
CREATE POLICY "Merchants can submit own promo code requests"
    ON public.merchant_promo_codes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        status = 'pending'
        AND reviewed_at IS NULL
        AND reviewed_by IS NULL
        AND rejection_reason IS NULL
        AND discount_type IN ('fixed', 'percentage')
        AND discount_value IS NOT NULL
        AND discount_value > 0
        AND (discount_type = 'fixed' OR discount_value <= 100)
        AND merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

ALTER TABLE public.master_transactions
  ADD COLUMN IF NOT EXISTS promo_code TEXT,
  ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES public.merchant_promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code TEXT,
  ADD COLUMN IF NOT EXISTS promo_code_id UUID REFERENCES public.merchant_promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.master_transactions
  DROP CONSTRAINT IF EXISTS master_transactions_discount_amount_nonnegative;
ALTER TABLE public.master_transactions
  ADD CONSTRAINT master_transactions_discount_amount_nonnegative CHECK (discount_amount >= 0);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_discount_amount_nonnegative;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_discount_amount_nonnegative CHECK (discount_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_orders_promo_code_id ON public.orders(promo_code_id);
CREATE INDEX IF NOT EXISTS idx_master_transactions_promo_code_id ON public.master_transactions(promo_code_id);

-- Recreate the review RPC with the new approval invariant. Merchants cannot
-- activate code-only legacy submissions because they do not contain terms.
CREATE OR REPLACE FUNCTION public.review_merchant_promo_code(
    p_request_id UUID,
    p_action TEXT,
    p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_request public.merchant_promo_codes;
    v_reason TEXT;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE id = (SELECT auth.uid()) AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Only platform administrators can review promo codes';
    END IF;

    IF p_action IS NULL OR p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid action. Must be approve or reject.';
    END IF;

    v_reason := NULLIF(btrim(COALESCE(p_rejection_reason, '')), '');
    IF v_reason IS NOT NULL AND char_length(v_reason) > 500 THEN
        RAISE EXCEPTION 'Rejection reason must be 500 characters or fewer.';
    END IF;

    SELECT * INTO v_request
    FROM public.merchant_promo_codes
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Promo code request not found.';
    END IF;
    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'This promo code request has already been %.', v_request.status;
    END IF;
    IF p_action = 'approve' AND (
        v_request.discount_type IS NULL
        OR v_request.discount_type NOT IN ('fixed', 'percentage')
        OR v_request.discount_value IS NULL
        OR (v_request.discount_type = 'fixed' AND v_request.discount_value <= 0)
        OR (v_request.discount_type = 'percentage' AND (v_request.discount_value <= 0 OR v_request.discount_value > 100))
    ) THEN
        RAISE EXCEPTION 'This promo code cannot be approved because it has no valid RM or percentage discount terms.';
    END IF;

    UPDATE public.merchant_promo_codes
    SET status = CASE WHEN p_action = 'approve' THEN 'active' ELSE 'rejected' END,
        rejection_reason = CASE WHEN p_action = 'reject' THEN v_reason ELSE NULL END,
        reviewed_at = now(),
        reviewed_by = (SELECT auth.uid())
    WHERE id = p_request_id
    RETURNING * INTO v_request;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_request.id,
        'code', v_request.code,
        'discount_type', v_request.discount_type,
        'discount_value', v_request.discount_value,
        'status', v_request.status,
        'merchant_id', v_request.merchant_id,
        'reviewed_at', v_request.reviewed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_merchant_promo_code(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_merchant_promo_code(UUID, TEXT, TEXT)
    TO authenticated, service_role;

-- Shared server-side calculation. The function accepts the discountable
-- subtotal as a numeric input; the Edge Function supplies the subtotal derived
-- from database menu prices and never trusts a client discount amount.
CREATE OR REPLACE FUNCTION public.calculate_merchant_promo_discount(
    p_code TEXT,
    p_merchant_id UUID,
    p_subtotal NUMERIC,
    p_gross_total NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code TEXT := upper(btrim(COALESCE(p_code, '')));
    v_subtotal NUMERIC := greatest(COALESCE(p_subtotal, 0), 0);
    v_gross_total NUMERIC := greatest(COALESCE(p_gross_total, 0), 0);
    v_promo public.merchant_promo_codes%ROWTYPE;
    v_discount NUMERIC := 0;
BEGIN
    IF v_code = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_REQUIRED', 'code', v_code);
    END IF;

    -- Preserve the existing TapauTime legacy offer.
    IF v_code = upper('tapau1ringgit') THEN
        v_discount := CASE WHEN v_gross_total > 1.00 THEN v_gross_total - 1.00 ELSE 0 END;
        RETURN jsonb_build_object(
            'valid', true,
            'code', v_code,
            'is_legacy', true,
            'promo_code_id', NULL,
            'discount_type', 'legacy_total',
            'discount_value', 1.00,
            'discount_amount', v_discount,
            'discount_cents', round(v_discount * 100)::INTEGER,
            'final_total', greatest(0, v_gross_total - v_discount)
        );
    END IF;

    IF p_merchant_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_MERCHANT_REQUIRED', 'code', v_code);
    END IF;

    SELECT * INTO v_promo
    FROM public.merchant_promo_codes
    WHERE merchant_id = p_merchant_id
      AND code = v_code
      AND status = 'active'
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_NOT_ACTIVE', 'code', v_code);
    END IF;
    IF v_promo.discount_type IS NULL OR v_promo.discount_value IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_TERMS_MISSING', 'code', v_code);
    END IF;

    IF v_promo.discount_type = 'fixed' THEN
        v_discount := least(v_subtotal, v_promo.discount_value);
    ELSIF v_promo.discount_type = 'percentage' THEN
        v_discount := round(v_subtotal * v_promo.discount_value / 100, 2);
    ELSE
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_TYPE_INVALID', 'code', v_code);
    END IF;

    v_discount := least(greatest(v_discount, 0), v_subtotal);
    RETURN jsonb_build_object(
        'valid', true,
        'code', v_code,
        'is_legacy', false,
        'promo_code_id', v_promo.id,
        'discount_type', v_promo.discount_type,
        'discount_value', v_promo.discount_value,
        'discount_amount', v_discount,
        'discount_cents', round(v_discount * 100)::INTEGER,
        'final_total', greatest(0, v_gross_total - v_discount)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_merchant_promo_discount(TEXT, UUID, NUMERIC, NUMERIC)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_merchant_promo_discount(TEXT, UUID, NUMERIC, NUMERIC)
    TO service_role;

NOTIFY pgrst, 'reload schema';

