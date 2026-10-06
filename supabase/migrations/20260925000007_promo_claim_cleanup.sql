-- =============================================================================
-- Migration: 20260925000007_promo_claim_cleanup.sql
-- Description:
--   Reclaims abandoned promo-code usage claims globally, not only when the same
--   idempotency key retries. A claim older than the 15-minute inventory hold
--   window no longer represents an active checkout.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.consume_merchant_promo_code(
    p_code TEXT,
    p_merchant_id UUID,
    p_subtotal NUMERIC,
    p_gross_total NUMERIC,
    p_idempotency_key TEXT
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
    v_released_claims INTEGER := 0;
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

    -- Reclaim every abandoned claim for this promo, not only the current key.
    -- This runs while the promo row is locked so the usage counter stays exact.
    DELETE FROM public.merchant_promo_code_redemptions
    WHERE promo_code_id = v_promo.id
      AND committed_at IS NULL
      AND created_at < now() - interval '15 minutes';
    GET DIAGNOSTICS v_released_claims = ROW_COUNT;
    IF v_released_claims > 0 THEN
        UPDATE public.merchant_promo_codes
        SET used_count = greatest(used_count - v_released_claims, 0)
        WHERE id = v_promo.id AND duration_type = 'usage_limit'
        RETURNING * INTO v_promo;
    END IF;

    IF v_promo.duration_type = 'expiration' AND v_promo.expiration_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_CODE_EXPIRED', 'code', v_code);
    END IF;
    IF v_promo.duration_type = 'usage_limit' AND v_promo.used_count >= v_promo.max_uses THEN
        RETURN jsonb_build_object('valid', false, 'error', 'PROMO_USAGE_LIMIT_REACHED', 'code', v_code);
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
        'remaining_uses', CASE WHEN v_promo.duration_type = 'usage_limit' THEN greatest(v_promo.max_uses - v_promo.used_count, 0) ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_merchant_promo_code(TEXT, UUID, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_merchant_promo_code(TEXT, UUID, NUMERIC, NUMERIC, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

