-- =============================================================================
-- Migration: 20260914000003_secure_confirm_dine_in_payment_rpc.sql
-- Description:
--   Hardens confirm_dine_in_payment RPC against IDOR vulnerability:
--   1. Matches by 128-bit unguessable transaction_id or id UUIDs.
--   2. Disallows marking orders as captured via 4-character display_id UNLESS
--      the authentic pickup_pin is explicitly supplied and matches.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.confirm_dine_in_payment(
    p_transaction_id TEXT,
    p_curlec_payment_id TEXT DEFAULT NULL,
    p_curlec_order_id TEXT DEFAULT NULL,
    p_pickup_pin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INTEGER := 0;
    v_master_id UUID;
BEGIN
    -- 1. Validate parameter
    IF p_transaction_id IS NULL OR trim(p_transaction_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'MISSING_TRANSACTION_ID');
    END IF;

    -- 2. Update master_transactions if exists
    BEGIN
        v_master_id := p_transaction_id::uuid;
        UPDATE public.master_transactions
        SET payment_status = 'captured',
            updated_at = NOW()
        WHERE id = v_master_id;
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 3. Update orders linked to this transaction_id with hardened IDOR guard:
    --    - Path A: Exact match on 128-bit transaction_id (UUID) or order id (UUID)
    --    - Path B: Match on display_id ONLY when accompanied by authentic matching pickup_pin
    UPDATE public.orders
    SET payment_status = 'captured',
        status = 'accepted',
        order_status = 'accepted',
        curlec_payment_id = COALESCE(p_curlec_payment_id, curlec_payment_id),
        updated_at = NOW()
    WHERE (
        transaction_id::text = p_transaction_id
        OR id::text = p_transaction_id
        OR (
            display_id = p_transaction_id
            AND p_pickup_pin IS NOT NULL
            AND trim(p_pickup_pin) != ''
            AND pickup_pin = p_pickup_pin
        )
    )
    AND payment_status != 'captured';

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    -- 4. Dual-update orders_v2 for KDS synchronization
    BEGIN
        UPDATE public.orders_v2
        SET current_status = 'ACCEPTED',
            updated_at = NOW()
        WHERE display_id IN (
            SELECT display_id FROM public.orders
            WHERE transaction_id::text = p_transaction_id
               OR id::text = p_transaction_id
               OR (
                   display_id = p_transaction_id
                   AND p_pickup_pin IS NOT NULL
                   AND trim(p_pickup_pin) != ''
                   AND pickup_pin = p_pickup_pin
               )
        );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    -- 5. Record order_events audit trail for orders_v2
    BEGIN
        INSERT INTO public.order_events (
            order_id,
            event_type,
            target_status,
            actor_role,
            payload
        )
        SELECT
            v2.id,
            'PAYMENT_CAPTURED',
            'accepted'::public.order_status,
            'CUSTOMER'::public.actor_role,
            jsonb_build_object(
                'curlec_payment_id', p_curlec_payment_id,
                'curlec_order_id', p_curlec_order_id,
                'pickup_pin', p_pickup_pin,
                'confirmed_at', NOW()
            )
        FROM public.orders_v2 v2
        JOIN public.orders o ON o.display_id = v2.display_id
        WHERE o.transaction_id::text = p_transaction_id
           OR o.id::text = p_transaction_id
           OR (
               o.display_id = p_transaction_id
               AND p_pickup_pin IS NOT NULL
               AND trim(p_pickup_pin) != ''
               AND o.pickup_pin = p_pickup_pin
           );
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN jsonb_build_object(
        'success', true,
        'updated_count', v_updated_count,
        'transaction_id', p_transaction_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_dine_in_payment(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
