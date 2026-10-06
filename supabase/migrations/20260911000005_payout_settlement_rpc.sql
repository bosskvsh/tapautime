-- =============================================================================
-- Migration: 20260911000005_payout_settlement_rpc.sql
-- Description: Creates administrative functions to complete or reject
--              merchant payout requests and maintain synchronized order states.
-- =============================================================================

-- 1. Settle a payout request (marks request and all attached orders as settled)
CREATE OR REPLACE FUNCTION public.settle_payout_request(p_payout_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
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

-- 2. Reject a payout request (marks request as rejected and returns orders to pending)
CREATE OR REPLACE FUNCTION public.reject_payout_request(p_payout_id UUID, p_reason TEXT DEFAULT '')
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
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

-- Permissions
GRANT EXECUTE ON FUNCTION public.settle_payout_request(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_payout_request(UUID, TEXT) TO authenticated, service_role;
