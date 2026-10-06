-- =============================================================================
-- Migration: 20260911000004_request_withdrawal_rpc.sql
-- Description: Creates request_full_withdrawal function for atomic balance
--              extraction and payout_request generation with CTE row locking.
--              Strictly excludes any order with pending order_status, pending
--              payment_status, or non-completed status from withdrawal.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.request_full_withdrawal(p_merchant_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_amount NUMERIC(10,2) := 0.00;
    v_payout_id UUID;
    v_order_ids UUID[];
BEGIN
    -- 1. Lock qualifying completed, captured orders for the merchant using CTE
    -- Separating row-level FOR UPDATE from aggregation satisfies Postgres requirement
    WITH locked_orders AS (
        SELECT id, merchant_cut
        FROM public.orders
        WHERE merchant_id = p_merchant_id::text
          AND payout_status = 'pending'
          AND payment_status IN ('captured', 'paid')
          AND (lower(order_status::text) = 'completed' OR lower(status) = 'completed')
          AND lower(order_status::text) != 'pending'
          AND lower(status) != 'pending'
        FOR UPDATE
    )
    SELECT 
        COALESCE(ARRAY_AGG(id), '{}'::UUID[]),
        COALESCE(SUM(merchant_cut), 0.00)
    INTO
        v_order_ids,
        v_total_amount
    FROM locked_orders;

    -- 2. Validate balance is greater than 0
    IF v_total_amount <= 0.00 OR ARRAY_LENGTH(v_order_ids, 1) IS NULL OR ARRAY_LENGTH(v_order_ids, 1) = 0 THEN
        RAISE EXCEPTION 'No completed captured balance available for withdrawal';
    END IF;

    -- 3. Insert new payout request row
    INSERT INTO public.payout_requests (
        merchant_id,
        amount,
        status,
        created_at
    ) VALUES (
        p_merchant_id,
        v_total_amount,
        'pending',
        now()
    )
    RETURNING id INTO v_payout_id;

    -- 4. Update the locked orders to processing and attach the payout_request_id
    UPDATE public.orders
    SET 
        payout_status = 'processing',
        payout_request_id = v_payout_id,
        updated_at = now()
    WHERE id = ANY(v_order_ids);

    -- 5. Return the new payout request ID
    RETURN v_payout_id;
END;
$$;

-- Grant execute permissions to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.request_full_withdrawal(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_full_withdrawal(UUID) TO service_role;
