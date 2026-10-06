-- =============================================================================
-- Migration: 20260925000006_merchant_promo_duration.sql
-- Description:
--   Adds mutually exclusive expiration/usage duration to merchant promo codes.
-- =============================================================================

ALTER TABLE public.merchant_promo_codes
  ADD COLUMN IF NOT EXISTS duration_type TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date DATE,
  ADD COLUMN IF NOT EXISTS max_uses INTEGER,
  ADD COLUMN IF NOT EXISTS used_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.merchant_promo_codes
  DROP CONSTRAINT IF EXISTS merchant_promo_codes_duration_type_check;
ALTER TABLE public.merchant_promo_codes
  ADD CONSTRAINT merchant_promo_codes_duration_type_check CHECK (
    duration_type IS NULL OR duration_type IN ('expiration', 'usage_limit')
  );

ALTER TABLE public.merchant_promo_codes
  DROP CONSTRAINT IF EXISTS merchant_promo_codes_duration_terms;
ALTER TABLE public.merchant_promo_codes
  ADD CONSTRAINT merchant_promo_codes_duration_terms CHECK (
    (duration_type IS NULL AND expiration_date IS NULL AND max_uses IS NULL)
    OR (duration_type = 'expiration' AND expiration_date IS NOT NULL AND max_uses IS NULL)
    OR (duration_type = 'usage_limit' AND expiration_date IS NULL AND max_uses IS NOT NULL AND max_uses > 0)
  );

ALTER TABLE public.merchant_promo_codes
  DROP CONSTRAINT IF EXISTS merchant_promo_codes_used_count_nonnegative;
ALTER TABLE public.merchant_promo_codes
  ADD CONSTRAINT merchant_promo_codes_used_count_nonnegative CHECK (used_count >= 0);

ALTER TABLE public.merchant_promo_codes
  DROP CONSTRAINT IF EXISTS merchant_promo_codes_used_within_limit;
ALTER TABLE public.merchant_promo_codes
  ADD CONSTRAINT merchant_promo_codes_used_within_limit CHECK (
    duration_type <> 'usage_limit'
    OR (max_uses IS NOT NULL AND used_count <= max_uses)
  );

CREATE INDEX IF NOT EXISTS idx_merchant_promo_codes_expiration
  ON public.merchant_promo_codes (expiration_date)
  WHERE status = 'active' AND duration_type = 'expiration';

CREATE INDEX IF NOT EXISTS idx_merchant_promo_codes_usage
  ON public.merchant_promo_codes (used_count, max_uses)
  WHERE status = 'active' AND duration_type = 'usage_limit';

-- One immutable claim per checkout attempt prevents retries or concurrent
-- duplicate requests from consuming more than one allowed use.
CREATE TABLE IF NOT EXISTS public.merchant_promo_code_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL REFERENCES public.merchant_promo_codes(id) ON DELETE CASCADE,
    checkout_idempotency_key TEXT NOT NULL UNIQUE
        CHECK (char_length(checkout_idempotency_key) BETWEEN 1 AND 200),
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    gross_total NUMERIC(10, 2) NOT NULL CHECK (gross_total >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL CHECK (discount_amount >= 0),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    committed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT merchant_promo_code_redemptions_discount_not_over_subtotal
        CHECK (discount_amount <= subtotal)
);

-- Keep the column available even if an earlier partial run created the table
-- before the order link was added.
ALTER TABLE public.merchant_promo_code_redemptions
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_merchant_promo_code_redemptions_promo
    ON public.merchant_promo_code_redemptions (promo_code_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchant_promo_code_redemptions_order
    ON public.merchant_promo_code_redemptions (order_id)
    WHERE order_id IS NOT NULL;

ALTER TABLE public.merchant_promo_code_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.merchant_promo_code_redemptions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_promo_code_redemptions TO service_role;


-- New merchant submissions must select exactly one duration. Legacy rows remain
-- readable and can remain active without a duration for backwards compatibility.
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
        AND used_count = 0
        AND discount_type IN ('fixed', 'percentage')
        AND discount_value IS NOT NULL
        AND discount_value > 0
        AND (discount_type = 'fixed' OR discount_value <= 100)
        AND (
          (duration_type = 'expiration' AND expiration_date >= CURRENT_DATE AND max_uses IS NULL)
          OR (duration_type = 'usage_limit' AND expiration_date IS NULL AND max_uses > 0)
        )
        AND merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

-- Recreate the review RPC so newly approved codes require valid duration terms.
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
    ) THEN
        RAISE EXCEPTION 'This promo code cannot be approved because its discount or duration terms are invalid.';
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
        'status', v_request.status,
        'merchant_id', v_request.merchant_id,
        'reviewed_at', v_request.reviewed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_merchant_promo_code(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_merchant_promo_code(UUID, TEXT, TEXT)
    TO authenticated, service_role;


-- Shared preview calculation. It checks availability but never consumes a use.
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
    IF v_code = upper('tapau1ringgit') THEN
        v_discount := CASE WHEN v_gross_total > 1.00 THEN v_gross_total - 1.00 ELSE 0 END;
        RETURN jsonb_build_object(
            'valid', true, 'code', v_code, 'is_legacy', true, 'promo_code_id', NULL,
            'discount_type', 'legacy_total', 'discount_value', 1.00,
            'discount_amount', v_discount, 'final_total', greatest(0, v_gross_total - v_discount)
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
        -- The preview describes the state after this order is placed.
        'remaining_uses', CASE WHEN v_promo.duration_type = 'usage_limit' THEN greatest(v_promo.max_uses - v_promo.used_count - 1, 0) ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_merchant_promo_discount(TEXT, UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_merchant_promo_discount(TEXT, UUID, NUMERIC, NUMERIC) TO service_role;


-- Atomically validate and consume one use. The Edge Function calls this only
-- after deriving the cart subtotal from database menu prices.
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

            -- Abandoned claims older than the inventory hold window no longer
            -- represent a checkout. Remove them and return usage-limit capacity.
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

-- Atomically link a claim to its newly created order and commit the use.
CREATE OR REPLACE FUNCTION public.commit_merchant_promo_code_use(
    p_promo_code_id UUID,
    p_idempotency_key TEXT,
    p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing public.merchant_promo_code_redemptions%ROWTYPE;
BEGIN
    IF p_promo_code_id IS NULL OR p_order_id IS NULL
       OR btrim(COALESCE(p_idempotency_key, '')) = '' THEN
        RETURN false;
    END IF;

    SELECT * INTO v_existing
    FROM public.merchant_promo_code_redemptions
    WHERE promo_code_id = p_promo_code_id
      AND checkout_idempotency_key = btrim(p_idempotency_key)
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Promo code redemption claim not found.';
    END IF;
    IF v_existing.committed_at IS NOT NULL THEN
        RETURN v_existing.order_id = p_order_id;
    END IF;
    IF v_existing.order_id IS NOT NULL AND v_existing.order_id <> p_order_id THEN
        RAISE EXCEPTION 'Promo code redemption is linked to a different order.';
    END IF;

    UPDATE public.merchant_promo_code_redemptions
    SET order_id = p_order_id, committed_at = now()
    WHERE id = v_existing.id;
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_merchant_promo_code_use(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_merchant_promo_code_use(UUID, TEXT, UUID) TO service_role;

-- Release a claimed use when order creation fails before the order exists.
CREATE OR REPLACE FUNCTION public.release_merchant_promo_code_use(
    p_promo_code_id UUID,
    p_idempotency_key TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted public.merchant_promo_code_redemptions%ROWTYPE;
BEGIN
    IF p_promo_code_id IS NULL OR btrim(COALESCE(p_idempotency_key, '')) = '' THEN
        RETURN;
    END IF;
    DELETE FROM public.merchant_promo_code_redemptions
    WHERE promo_code_id = p_promo_code_id
      AND checkout_idempotency_key = btrim(p_idempotency_key)
      AND committed_at IS NULL
    RETURNING * INTO v_deleted;
    IF FOUND THEN
        UPDATE public.merchant_promo_codes
        SET used_count = greatest(used_count - 1, 0)
        WHERE id = p_promo_code_id AND duration_type = 'usage_limit';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.release_merchant_promo_code_use(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_merchant_promo_code_use(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';

