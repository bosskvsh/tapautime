-- =============================================================================
-- Migration: 20260925000003_merchant_promo_codes.sql
-- Description:
--   Merchant promo-code submissions and administrator review workflow.
--   A submission starts as pending; only the review RPC can activate or reject it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    CONSTRAINT merchant_promo_codes_code_format CHECK (
        code = upper(btrim(code))
        AND code ~ '^[A-Z0-9_-]{1,24}$'
    ),
    CONSTRAINT merchant_promo_codes_review_state CHECK (
        (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL AND rejection_reason IS NULL)
        OR
        (status IN ('active', 'rejected') AND reviewed_at IS NOT NULL)
    ),
    CONSTRAINT merchant_promo_codes_rejection_reason_length CHECK (
        rejection_reason IS NULL OR char_length(rejection_reason) <= 500
    )
);

-- A rejected code can be submitted again, but a merchant cannot have two
-- pending/active requests for the same code at the same time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchant_promo_codes_active_code
    ON public.merchant_promo_codes (merchant_id, code)
    WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_merchant_promo_codes_merchant_created
    ON public.merchant_promo_codes (merchant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_merchant_promo_codes_status_created
    ON public.merchant_promo_codes (status, created_at DESC);

ALTER TABLE public.merchant_promo_codes ENABLE ROW LEVEL SECURITY;

-- Merchants can read only their own submissions.
DROP POLICY IF EXISTS "Merchants can read own promo code submissions" ON public.merchant_promo_codes;
CREATE POLICY "Merchants can read own promo code submissions"
    ON public.merchant_promo_codes
    FOR SELECT
    TO authenticated
    USING (
        merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

-- Admins can read the complete review queue.
DROP POLICY IF EXISTS "Admins can read all promo code submissions" ON public.merchant_promo_codes;
CREATE POLICY "Admins can read all promo code submissions"
    ON public.merchant_promo_codes
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.users
            WHERE id = (SELECT auth.uid())
              AND role = 'admin'
        )
    );

-- A merchant can only create a pending request for their own merchant.
-- There is deliberately no merchant UPDATE or DELETE policy: review decisions
-- must go through the administrator-only RPC below.
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
        AND merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

-- The client roles receive only the table privileges they need. RLS provides
-- the row-level authorization; no client-side role can update/delete a review.
REVOKE ALL ON public.merchant_promo_codes FROM anon, authenticated;
GRANT SELECT, INSERT ON public.merchant_promo_codes TO authenticated;
GRANT SELECT ON public.merchant_promo_codes TO service_role;

-- Atomic, administrator-only review transition. The row lock prevents two
-- concurrent reviews from both succeeding.
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
        SELECT 1
        FROM public.users
        WHERE id = (SELECT auth.uid())
          AND role = 'admin'
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

    SELECT *
    INTO v_request
    FROM public.merchant_promo_codes
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Promo code request not found.';
    END IF;

    IF v_request.status <> 'pending' THEN
        RAISE EXCEPTION 'This promo code request has already been %.', v_request.status;
    END IF;

    UPDATE public.merchant_promo_codes
    SET
        status = CASE WHEN p_action = 'approve' THEN 'active' ELSE 'rejected' END,
        rejection_reason = CASE WHEN p_action = 'reject' THEN v_reason ELSE NULL END,
        reviewed_at = now(),
        reviewed_by = (SELECT auth.uid())
    WHERE id = p_request_id
    RETURNING * INTO v_request;

    RETURN jsonb_build_object(
        'success', true,
        'id', v_request.id,
        'code', v_request.code,
        'status', v_request.status,
        'merchant_id', v_request.merchant_id,
        'reviewed_at', v_request.reviewed_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.review_merchant_promo_code(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_merchant_promo_code(UUID, TEXT, TEXT)
    TO authenticated, service_role;

-- Realtime lets both dashboards reflect review decisions without a refresh.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'merchant_promo_codes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_promo_codes;
    END IF;
END
$$;

ALTER TABLE public.merchant_promo_codes REPLICA IDENTITY FULL;

-- Refresh PostgREST's schema cache after creating the table and function.
NOTIFY pgrst, 'reload schema';

