-- =============================================================================
-- Migration: 20260925000011_merchant_promo_applicable_to.sql
-- Description:
--   Adds order fulfillment applicability ('tapau', 'dine_in', 'both') to
--   merchant promo codes and enforces it during checkout validation.
-- =============================================================================

-- 1. Add applicable_to column to merchant_promo_codes
ALTER TABLE public.merchant_promo_codes
  ADD COLUMN IF NOT EXISTS applicable_to TEXT NOT NULL DEFAULT 'both';

ALTER TABLE public.merchant_promo_codes
  DROP CONSTRAINT IF EXISTS merchant_promo_codes_applicable_to_check;

ALTER TABLE public.merchant_promo_codes
  ADD CONSTRAINT merchant_promo_codes_applicable_to_check CHECK (
    applicable_to IN ('tapau', 'dine_in', 'both')
  );

-- 2. Update RLS INSERT policy to enforce valid applicable_to values
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
        AND duration_type IN ('expiration', 'usage_limit')
        AND (
          (duration_type = 'expiration' AND expiration_date >= CURRENT_DATE AND max_uses IS NULL)
          OR (duration_type = 'usage_limit' AND expiration_date IS NULL AND max_uses > 0)
        )
        AND applicable_to IN ('tapau', 'dine_in', 'both')
        AND merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

-- 3. Update review_merchant_promo_code RPC to validate and return applicable_to
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
        OR v_request.duration_type IS NULL
        OR (v_request.duration_type = 'expiration' AND (v_request.expiration_date IS NULL OR v_request.expiration_date < CURRENT_DATE OR v_request.max_uses IS NOT NULL))
        OR (v_request.duration_type = 'usage_limit' AND (v_request.expiration_date IS NOT NULL OR v_request.max_uses IS NULL OR v_request.max_uses <= 0))
        OR v_request.applicable_to IS NULL
        OR v_request.applicable_to NOT IN ('tapau', 'dine_in', 'both')
    ) THEN
        RAISE EXCEPTION 'This promo code cannot be approved because its discount, duration, or applicability terms are invalid.';
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
        'duration_type', v_request.duration_type,
        'expiration_date', v_request.expiration_date,
        'max_uses', v_request.max_uses,
        'applicable_to', v_request.applicable_to,
        'status', v_request.status,
        'merchant_id', v_request.merchant_id,
        'reviewed_at', v_request.reviewed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_merchant_promo_code(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_merchant_promo_code(UUID, TEXT, TEXT)
    TO authenticated, service_role;

-- 4. Recreate calculate_merchant_promo_discount with optional p_order_type
DROP FUNCTION IF EXISTS public.calculate_merchant_promo_discount(TEXT, UUID, NUMERIC, NUMERIC);
DROP FUNCTION IF EXISTS public.calculate_merchant_promo_discount(TEXT, UUID, NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.calculate_merchant_promo_discount(
    p_code TEXT,
    p_merchant_id UUID,
    p_subtotal NUMERIC,
    p_gross_total NUMERIC,
    p_order_type TEXT DEFAULT NULL
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
    v_norm_order TEXT;
BEGIN
    IF v_code = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_REQUIRED', 'code', v_code);
    END IF;
    IF v_code = upper('tapau1ringgit') THEN
        v_discount := CASE WHEN v_gross_total > 1.00 THEN v_gross_total - 1.00 ELSE 0 END;
        RETURN jsonb_build_object(
            'valid', true, 'code', v_code, 'is_legacy', true, 'promo_code_id', NULL,
            'discount_type', 'legacy_total', 'discount_value', 1.00,
            'discount_amount', v_discount, 'final_total', greatest(0, v_gross_total - v_discount),
            'applicable_to', 'both'
        );
    END IF;
    IF p_merchant_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_MERCHANT_REQUIRED', 'code', v_code);
    END IF;

    SELECT * INTO v_promo
    FROM public.merchant_promo_codes
    WHERE merchant_id = p_merchant_id AND code = v_code AND status = 'active'
    ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_NOT_ACTIVE', 'code', v_code);
    END IF;
    IF v_promo.discount_type IS NULL OR v_promo.discount_value IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_TERMS_MISSING', 'code', v_code);
    END IF;
    IF v_promo.duration_type = 'expiration' AND v_promo.expiration_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_EXPIRED', 'code', v_code);
    END IF;
    IF v_promo.duration_type = 'usage_limit' AND v_promo.used_count >= v_promo.max_uses THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_USAGE_LIMIT_REACHED', 'code', v_code);
    END IF;

    -- Validate order type applicability if an order type is supplied
    IF p_order_type IS NOT NULL AND btrim(p_order_type) <> '' AND v_promo.applicable_to <> 'both' THEN
        v_norm_order := CASE
            WHEN lower(btrim(p_order_type)) IN ('dine_in', 'dinein') THEN 'dine_in'
            WHEN lower(btrim(p_order_type)) IN ('tapau', 'takeaway') THEN 'tapau'
            ELSE lower(btrim(p_order_type))
        END;
        IF v_promo.applicable_to <> v_norm_order THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'PROMO_ORDER_TYPE_MISMATCH',
                'code', v_code,
                'applicable_to', v_promo.applicable_to
            );
        END IF;
    END IF;

    IF v_promo.discount_type = 'fixed' THEN
        v_discount := least(v_subtotal, v_promo.discount_value);
    ELSE
        v_discount := round(v_subtotal * v_promo.discount_value / 100, 2);
    END IF;
    v_discount := least(greatest(v_discount, 0), v_subtotal);
    RETURN jsonb_build_object(
        'valid', true, 'code', v_code, 'is_legacy', false, 'promo_code_id', v_promo.id,
        'discount_type', v_promo.discount_type, 'discount_value', v_promo.discount_value,
        'discount_amount', v_discount, 'final_total', greatest(0, v_gross_total - v_discount),
        'duration_type', v_promo.duration_type, 'expiration_date', v_promo.expiration_date,
        'max_uses', v_promo.max_uses, 'used_count', v_promo.used_count,
        'applicable_to', v_promo.applicable_to,
        'remaining_uses', CASE WHEN v_promo.duration_type = 'usage_limit' THEN greatest(v_promo.max_uses - v_promo.used_count - 1, 0) ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_merchant_promo_discount(TEXT, UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_merchant_promo_discount(TEXT, UUID, NUMERIC, NUMERIC, TEXT) TO service_role;

-- 5. Recreate consume_merchant_promo_code with optional p_order_type
DROP FUNCTION IF EXISTS public.consume_merchant_promo_code(TEXT, UUID, NUMERIC, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.consume_merchant_promo_code(TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.consume_merchant_promo_code(
    p_code TEXT,
    p_merchant_id UUID,
    p_subtotal NUMERIC,
    p_gross_total NUMERIC,
    p_idempotency_key TEXT,
    p_order_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_code TEXT := upper(btrim(COALESCE(p_code, '')));
    v_subtotal NUMERIC := greatest(COALESCE(p_subtotal, 0), 0);
    v_gross_total NUMERIC := greatest(COALESCE(p_gross_total, 0), 0);
    v_promo public.merchant_promo_codes%ROWTYPE;
    v_existing public.merchant_promo_code_redemptions%ROWTYPE;
    v_discount NUMERIC := 0;
    v_idempotency_key TEXT := btrim(COALESCE(p_idempotency_key, ''));
    v_norm_order TEXT;
BEGIN
    IF v_code = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_REQUIRED', 'code', v_code);
    END IF;
    IF p_merchant_id IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_MERCHANT_REQUIRED', 'code', v_code);
    END IF;
    IF v_idempotency_key = '' THEN
        RETURN jsonb_build_object('valid', false, 'error', 'IDEMPOTENCY_KEY_REQUIRED', 'code', v_code);
    END IF;

    SELECT * INTO v_existing
    FROM public.merchant_promo_code_redemptions
    WHERE checkout_idempotency_key = v_idempotency_key
    FOR UPDATE;
    IF FOUND THEN
        IF v_existing.promo_code_id IS DISTINCT FROM (
            SELECT id FROM public.merchant_promo_codes
            WHERE merchant_id = p_merchant_id AND code = v_code AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        ) THEN
            RETURN jsonb_build_object('valid', false, 'error', 'IDEMPOTENCY_PROMO_MISMATCH', 'code', v_code);
        END IF;
        SELECT * INTO v_promo
        FROM public.merchant_promo_codes WHERE id = v_existing.promo_code_id;

        IF v_existing.committed_at IS NULL THEN
            IF v_existing.created_at >= now() - interval '15 minutes' THEN
                RETURN jsonb_build_object('valid', false, 'error', 'PROMO_REDEEM_IN_PROGRESS', 'code', v_code);
            END IF;

            DELETE FROM public.merchant_promo_code_redemptions
            WHERE id = v_existing.id AND committed_at IS NULL;
            IF FOUND THEN
                UPDATE public.merchant_promo_codes
                SET used_count = greatest(used_count - 1, 0)
                WHERE id = v_promo.id AND duration_type = 'usage_limit';
            END IF;
        ELSE
            RETURN jsonb_build_object(
                'valid', true, 'code', v_code, 'is_legacy', false, 'promo_code_id', v_promo.id,
                'discount_type', v_promo.discount_type, 'discount_value', v_promo.discount_value,
                'discount_amount', v_existing.discount_amount,
                'final_total', greatest(0, v_existing.gross_total - v_existing.discount_amount),
                'duration_type', v_promo.duration_type, 'expiration_date', v_promo.expiration_date,
                'max_uses', v_promo.max_uses, 'used_count', v_promo.used_count,
                'applicable_to', v_promo.applicable_to,
                'remaining_uses', CASE WHEN v_promo.duration_type = 'usage_limit' THEN greatest(v_promo.max_uses - v_promo.used_count, 0) ELSE NULL END,
                'idempotent_replay', true, 'order_id', v_existing.order_id
            );
        END IF;
    END IF;

    SELECT * INTO v_promo
    FROM public.merchant_promo_codes
    WHERE merchant_id = p_merchant_id AND code = v_code AND status = 'active'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_NOT_ACTIVE', 'code', v_code);
    END IF;
    IF v_promo.discount_type IS NULL OR v_promo.discount_value IS NULL THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_TERMS_MISSING', 'code', v_code);
    END IF;
    IF v_promo.duration_type = 'expiration' AND v_promo.expiration_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_EXPIRED', 'code', v_code);
    END IF;
    IF v_promo.duration_type = 'usage_limit' AND v_promo.used_count >= v_promo.max_uses THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_USAGE_LIMIT_REACHED', 'code', v_code);
    END IF;

    -- Validate order type applicability if an order type is supplied
    IF p_order_type IS NOT NULL AND btrim(p_order_type) <> '' AND v_promo.applicable_to <> 'both' THEN
        v_norm_order := CASE
            WHEN lower(btrim(p_order_type)) IN ('dine_in', 'dinein') THEN 'dine_in'
            WHEN lower(btrim(p_order_type)) IN ('tapau', 'takeaway') THEN 'tapau'
            ELSE lower(btrim(p_order_type))
        END;
        IF v_promo.applicable_to <> v_norm_order THEN
            RETURN jsonb_build_object(
                'valid', false,
                'error', 'PROMO_ORDER_TYPE_MISMATCH',
                'code', v_code,
                'applicable_to', v_promo.applicable_to
            );
        END IF;
    END IF;

    IF v_promo.discount_type = 'fixed' THEN
        v_discount := least(v_subtotal, v_promo.discount_value);
    ELSE
        v_discount := round(v_subtotal * v_promo.discount_value / 100, 2);
    END IF;
    v_discount := least(greatest(v_discount, 0), v_subtotal);

    INSERT INTO public.merchant_promo_code_redemptions (
        promo_code_id, checkout_idempotency_key, subtotal, gross_total, discount_amount
    ) VALUES (
        v_promo.id, v_idempotency_key, v_subtotal, v_gross_total, v_discount
    );

    IF v_promo.duration_type = 'usage_limit' THEN
        UPDATE public.merchant_promo_codes
        SET used_count = used_count + 1
        WHERE id = v_promo.id
        RETURNING * INTO v_promo;
    END IF;

    RETURN jsonb_build_object(
        'valid', true, 'code', v_code, 'is_legacy', false, 'promo_code_id', v_promo.id,
        'discount_type', v_promo.discount_type, 'discount_value', v_promo.discount_value,
        'discount_amount', v_discount, 'final_total', greatest(0, v_gross_total - v_discount),
        'duration_type', v_promo.duration_type, 'expiration_date', v_promo.expiration_date,
        'max_uses', v_promo.max_uses, 'used_count', v_promo.used_count,
        'applicable_to', v_promo.applicable_to,
        'remaining_uses', CASE WHEN v_promo.duration_type = 'usage_limit' THEN greatest(v_promo.max_uses - v_promo.used_count, 0) ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_merchant_promo_code(TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_merchant_promo_code(TEXT, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO service_role;
