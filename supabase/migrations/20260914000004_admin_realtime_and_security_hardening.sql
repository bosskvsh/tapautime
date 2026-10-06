-- =============================================================================
-- Migration: 20260914000004_admin_realtime_and_security_hardening.sql
-- Description:
--   1. Registers merchant_applications and payout_requests to supabase_realtime
--      publication so Admin Dashboard receives live push updates.
--   2. Enforces strict role = 'admin' security checks on settle_payout_request
--      and reject_payout_request RPCs (prevents IDOR / financial tampering).
--   3. Enforces role = 'admin' check on review_store_name_change RPC and
--      tightens RLS policy on public.store_name_change_requests.
-- =============================================================================

-- 1. Realtime Publication Registration & Replica Identity
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'merchant_applications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_applications;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'payout_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_requests;
    END IF;
END $$;

ALTER TABLE public.merchant_applications REPLICA IDENTITY FULL;
ALTER TABLE public.payout_requests REPLICA IDENTITY FULL;

-- 2. Settle Payout Request: Hardened with role = 'admin' Security Check
CREATE OR REPLACE FUNCTION public.settle_payout_request(p_payout_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Security guard: must be service_role or user with role = 'admin'
    IF current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Only platform administrators can settle payouts';
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.payout_requests WHERE id = p_payout_id
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Payout request % not found', p_payout_id;
    END IF;

    -- Update payout request status to settled
    UPDATE public.payout_requests
    SET status = 'settled'
    WHERE id = p_payout_id;

    -- Update all batched orders to settled
    UPDATE public.orders
    SET 
        payout_status = 'settled',
        updated_at = now()
    WHERE payout_request_id = p_payout_id;

    RETURN TRUE;
END;
$$;

-- 3. Reject Payout Request: Hardened with role = 'admin' Security Check
CREATE OR REPLACE FUNCTION public.reject_payout_request(p_payout_id UUID, p_reason TEXT DEFAULT '')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Security guard: must be service_role or user with role = 'admin'
    IF current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Only platform administrators can reject payouts';
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.payout_requests WHERE id = p_payout_id
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Payout request % not found', p_payout_id;
    END IF;

    -- Update payout request status to rejected
    UPDATE public.payout_requests
    SET status = 'rejected'
    WHERE id = p_payout_id;

    -- Revert orders back to pending so funds return to the merchant's available balance
    UPDATE public.orders
    SET 
        payout_status = 'pending',
        payout_request_id = NULL,
        updated_at = now()
    WHERE payout_request_id = p_payout_id;

    RETURN TRUE;
END;
$$;

-- 4. Review Store Name Change: Hardened with role = 'admin' Security Check
CREATE OR REPLACE FUNCTION public.review_store_name_change(
    p_request_id UUID,
    p_action TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_new_slug TEXT;
BEGIN
    -- Security guard: must be service_role or user with role = 'admin'
    IF current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Only platform administrators can review store name changes';
        END IF;
    END IF;

    IF p_action NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid action. Must be approve or reject.';
    END IF;

    SELECT * INTO v_req
    FROM public.store_name_change_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Store name change request not found.';
    END IF;

    IF v_req.status != 'pending' THEN
        RAISE EXCEPTION 'This request has already been %', v_req.status;
    END IF;

    IF p_action = 'approve' THEN
        -- Generate sanitized slug
        v_new_slug := lower(regexp_replace(trim(v_req.requested_name), '[^a-zA-Z0-9]+', '-', 'g'));
        v_new_slug := trim(both '-' from v_new_slug);

        -- Update merchant business name and slug
        UPDATE public.merchants
        SET
            business_name = trim(v_req.requested_name),
            slug = CASE 
                WHEN v_new_slug != '' THEN v_new_slug 
                ELSE slug 
            END,
            updated_at = now()
        WHERE id = v_req.merchant_id;

        -- Update request status
        UPDATE public.store_name_change_requests
        SET
            status = 'approved',
            admin_notes = p_notes,
            reviewed_at = now(),
            reviewed_by = auth.uid()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'approved',
            'new_name', trim(v_req.requested_name),
            'merchant_id', v_req.merchant_id
        );
    ELSE
        -- Reject request
        UPDATE public.store_name_change_requests
        SET
            status = 'rejected',
            admin_notes = p_notes,
            reviewed_at = now(),
            reviewed_by = auth.uid()
        WHERE id = p_request_id;

        RETURN jsonb_build_object(
            'success', true,
            'action', 'rejected',
            'merchant_id', v_req.merchant_id
        );
    END IF;
END;
$$;

-- 5. Tighten RLS Policy on public.store_name_change_requests
DROP POLICY IF EXISTS "Admins can update name requests" ON public.store_name_change_requests;
CREATE POLICY "Admins can update name requests"
ON public.store_name_change_requests
FOR UPDATE
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

-- 6. Add admin RLS policy for public.orders_v2 (allows KDS sync during admin override)
DROP POLICY IF EXISTS "Admins have full access to orders_v2" ON public.orders_v2;
CREATE POLICY "Admins have full access to orders_v2"
ON public.orders_v2
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

-- Grant execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.settle_payout_request(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_payout_request(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_store_name_change(UUID, TEXT, TEXT) TO authenticated, service_role;
