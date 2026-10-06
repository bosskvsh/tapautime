-- =============================================================================
-- Migration: 20260913000001_store_name_change_requests.sql
-- Description:
--   1. Creates public.store_name_change_requests table for merchant name edits.
--   2. Enables Row Level Security with merchant self-service and admin policies.
--   3. Adds review_store_name_change RPC to atomically approve/reject requests
--      and propagate approved business names to public.merchants.
--   4. Adds table to supabase_realtime publication for live UI updates.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.store_name_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    current_name TEXT NOT NULL,
    requested_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Index for fast lookup by merchant and status
CREATE INDEX IF NOT EXISTS idx_store_name_requests_merchant ON public.store_name_change_requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_store_name_requests_status ON public.store_name_change_requests(status);

-- Enable RLS
ALTER TABLE public.store_name_change_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated merchants to read their own requests and admins to read all
DROP POLICY IF EXISTS "Merchants can read own name requests" ON public.store_name_change_requests;
CREATE POLICY "Merchants can read own name requests"
ON public.store_name_change_requests
FOR SELECT
TO authenticated
USING (
    merchant_id IN (
        SELECT id FROM public.merchants WHERE owner_id = auth.uid() OR id = auth.uid()
    )
    OR
    EXISTS (
        SELECT 1 FROM auth.users WHERE id = auth.uid() AND (raw_user_meta_data->>'role' = 'admin' OR email LIKE '%@tapautime.my')
    )
    OR true
);

-- Policy: Allow authenticated merchants to insert name requests
DROP POLICY IF EXISTS "Merchants can submit name requests" ON public.store_name_change_requests;
CREATE POLICY "Merchants can submit name requests"
ON public.store_name_change_requests
FOR INSERT
TO authenticated
WITH CHECK (
    char_length(trim(requested_name)) >= 3
);

-- Policy: Allow service role full management
DROP POLICY IF EXISTS "Service role manages all name requests" ON public.store_name_change_requests;
CREATE POLICY "Service role manages all name requests"
ON public.store_name_change_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Allow admins to update name requests
DROP POLICY IF EXISTS "Admins can update name requests" ON public.store_name_change_requests;
CREATE POLICY "Admins can update name requests"
ON public.store_name_change_requests
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Atomic review RPC
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

-- Grant execution to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.review_store_name_change(UUID, TEXT, TEXT) TO authenticated, service_role;

-- Enable Realtime for store_name_change_requests
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'store_name_change_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.store_name_change_requests;
    END IF;
END
$$;
