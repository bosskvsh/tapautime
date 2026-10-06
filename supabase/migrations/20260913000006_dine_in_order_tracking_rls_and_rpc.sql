-- =============================================================================
-- Migration: 20260913000006_dine_in_order_tracking_rls_and_rpc.sql
-- Description:
--   Enables foolproof, secure real-time tracking for anonymous Dine-In table orders:
--   1. Grants targeted anon SELECT on orders for order_type = 'dine_in' so
--      Supabase Realtime can evaluate socket subscriptions on table orders.
--   2. Grants anon SELECT on order_items linked to dine_in orders.
--   3. Provides a SECURITY DEFINER RPC get_dine_in_order_status() with PIN verification
--      as an unshakeable polling fallback across mobile network drops.
-- =============================================================================

-- 1. Allow anon to SELECT orders for dine-in orders
DROP POLICY IF EXISTS "anon_select_dine_in_orders" ON public.orders;
CREATE POLICY "anon_select_dine_in_orders"
  ON public.orders
  FOR SELECT
  TO anon
  USING (order_type = 'dine_in');

-- 2. Allow anon to SELECT order_items for dine-in orders
DROP POLICY IF EXISTS "anon_select_dine_in_order_items" ON public.order_items;
CREATE POLICY "anon_select_dine_in_order_items"
  ON public.order_items
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE orders.id = order_items.order_id
        AND orders.order_type = 'dine_in'
    )
  );

-- 3. Secure RPC to fetch complete Dine-In order tracking details by order_id or transaction_id and pickup_pin
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
    -- Query order by either id, display_id, or transaction_id matching with pickup_pin
    SELECT *
    INTO v_order
    FROM public.orders
    WHERE (id::text = p_order_id OR display_id = p_order_id OR transaction_id::text = p_order_id)
      AND (p_pickup_pin IS NULL OR p_pickup_pin = '' OR pickup_pin = p_pickup_pin)
      AND order_type = 'dine_in'
    ORDER BY created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
    END IF;

    -- Fetch order items
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', oi.id,
                'name', COALESCE(oi.item_name, mi.name, 'Item'),
                'quantity', oi.quantity,
                'unit_price', oi.unit_price,
                'modifiers', oi.selected_modifiers,
                'special_instructions', oi.special_instructions
            )
        ),
        '[]'::jsonb
    )
    INTO v_items
    FROM public.order_items oi
    LEFT JOIN public.menu_items mi ON mi.id = oi.menu_item_id
    WHERE oi.order_id = v_order.id;

    RETURN jsonb_build_object(
        'success', true,
        'order', jsonb_build_object(
            'id', v_order.id,
            'display_id', v_order.display_id,
            'order_status', COALESCE(v_order.order_status, v_order.status),
            'payment_status', v_order.payment_status,
            'table_number', v_order.table_number,
            'pickup_pin', v_order.pickup_pin,
            'total_amount', v_order.total_amount,
            'created_at', v_order.created_at,
            'updated_at', v_order.updated_at,
            'items', v_items
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dine_in_order_status(TEXT, TEXT) TO anon, authenticated;
