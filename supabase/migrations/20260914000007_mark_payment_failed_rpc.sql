-- Migration: 20260914000007_mark_payment_failed_rpc.sql
-- Description: Authoritative SECURITY DEFINER RPC to mark orders and master_transactions as failed/cancelled
-- and safely restore reserved stock inventory without RLS barriers.

CREATE OR REPLACE FUNCTION public.mark_payment_failed(
    p_transaction_id TEXT,
    p_reason TEXT DEFAULT 'Payment failed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_tx_uuid UUID;
    v_order RECORD;
    v_v2_order RECORD;
    v_updated_count INT := 0;
    v_items_to_release JSONB := '[]'::jsonb;
BEGIN
    BEGIN
        v_tx_uuid := p_transaction_id::UUID;
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_TRANSACTION_ID');
    END;

    -- 1. Update master_transactions if not already captured
    UPDATE public.master_transactions
    SET 
        payment_status = 'failed',
        updated_at = NOW()
    WHERE id = v_tx_uuid
      AND payment_status != 'captured';

    -- 2. Loop through and update corresponding orders
    FOR v_order IN
        SELECT id, display_id, order_status, payment_status
        FROM public.orders
        WHERE (transaction_id = v_tx_uuid OR id = v_tx_uuid)
          AND payment_status != 'captured'
        FOR UPDATE
    LOOP
        UPDATE public.orders
        SET 
            order_status = 'cancelled',
            status = 'cancelled',
            payment_status = 'failed',
            updated_at = NOW()
        WHERE id = v_order.id;

        v_updated_count := v_updated_count + 1;

        -- 3. Synchronize orders_v2 if record exists
        IF v_order.display_id IS NOT NULL THEN
            SELECT id INTO v_v2_order
            FROM public.orders_v2
            WHERE display_id = v_order.display_id
            LIMIT 1;

            IF FOUND THEN
                BEGIN
                    UPDATE public.orders_v2
                    SET 
                        current_status = 'CANCELLED'::public.order_status,
                        updated_at = NOW()
                    WHERE id = v_v2_order.id;

                    INSERT INTO public.order_events (
                        order_id,
                        event_type,
                        target_status,
                        actor_role,
                        payload
                    ) VALUES (
                        v_v2_order.id,
                        'PAYMENT_FAILED',
                        'CANCELLED'::public.order_status,
                        'SYSTEM',
                        jsonb_build_object(
                            'reason', p_reason,
                            'transaction_id', p_transaction_id,
                            'marked_at', NOW()
                        )
                    );
                EXCEPTION WHEN OTHERS THEN
                    NULL;
                END;
            END IF;
        END IF;

        -- 4. Restore reserved stock quantities
        BEGIN
            SELECT COALESCE(
                jsonb_agg(
                    jsonb_build_object(
                        'item_id', item_id,
                        'quantity', quantity
                    )
                ),
                '[]'::jsonb
            )
            INTO v_items_to_release
            FROM public.order_items
            WHERE order_id = v_order.id;

            IF jsonb_array_length(v_items_to_release) > 0 THEN
                PERFORM public.release_atomic_reservation(v_items_to_release);
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', p_transaction_id,
        'orders_updated', v_updated_count
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_payment_failed(TEXT, TEXT) TO anon, authenticated, service_role;
