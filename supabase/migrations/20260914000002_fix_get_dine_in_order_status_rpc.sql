-- =============================================================================
-- Migration: 20260914000002_fix_get_dine_in_order_status_rpc.sql
-- Fix get_dine_in_order_status RPC schema references:
-- 1. Correct oi.item_id (was oi.menu_item_id)
-- 2. Correct oi.price_at_time_of_order (was oi.unit_price)
-- 3. Defensively match order_type = 'dine_in' OR table_number IS NOT NULL
-- 4. Cast order_status and status to text in COALESCE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_dine_in_order_status(
    p_order_id TEXT,
    p_pickup_pin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_items JSONB;
BEGIN
    -- 1. Query order by either id, display_id, or transaction_id matching with optional pickup_pin
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE (id::text = p_order_id OR display_id = p_order_id OR transaction_id::text = p_order_id)
      AND (p_pickup_pin IS NULL OR p_pickup_pin = '' OR pickup_pin = p_pickup_pin)
      AND (order_type = 'dine_in' OR table_number IS NOT NULL)
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
    END IF;

    -- 2. Fetch order items using exact schema column names
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', oi.id,
                'name', COALESCE(oi.item_name, mi.name, 'Item'),
                'quantity', oi.quantity,
                'unit_price', COALESCE(oi.price_at_time_of_order, 0),
                'modifiers', oi.selected_modifiers,
                'special_instructions', oi.special_instructions
            )
        ),
        '[]'::jsonb
    )
    INTO v_items
    FROM public.order_items oi
    LEFT JOIN public.menu_items mi ON mi.id = oi.item_id
    WHERE oi.order_id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'order', jsonb_build_object(
            'id', v_order.id,
            'display_id', COALESCE(v_order.display_id, '#' || UPPER(SUBSTRING(v_order.id::text, 1, 4)) || '-1'),
            'order_status', COALESCE(v_order.order_status::text, v_order.status::text, 'accepted'),
            'payment_status', v_order.payment_status,
            'table_number', COALESCE(v_order.table_number, ''),
            'pickup_pin', COALESCE(v_order.pickup_pin, ''),
            'total_amount', COALESCE(v_order.total_amount, 0),
            'created_at', v_order.created_at,
            'updated_at', v_order.updated_at,
            'items', v_items
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dine_in_order_status(TEXT, TEXT) TO anon, authenticated;
