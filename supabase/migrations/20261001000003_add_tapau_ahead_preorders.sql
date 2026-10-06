-- Add Tapau Ahead Pre-order feature columns

ALTER TABLE public.menu_items 
ADD COLUMN requires_preorder boolean DEFAULT false,
ADD COLUMN lead_time_days integer DEFAULT 0,
ADD COLUMN daily_capacity integer NULL;

ALTER TABLE public.orders 
ADD COLUMN is_preorder boolean DEFAULT false,
ADD COLUMN scheduled_pickup_date timestamp with time zone NULL;

-- Create RPC for checking capacity atomically
CREATE OR REPLACE FUNCTION check_preorder_capacity(
  p_merchant_id UUID,
  p_scheduled_date DATE,
  p_items JSONB -- [{ "menu_item_id": "...", "quantity": 2 }]
) RETURNS JSONB AS $$
DECLARE
  item JSONB;
  v_item_id UUID;
  v_quantity INT;
  v_capacity INT;
  v_current_count INT;
BEGIN
  -- Iterate through items to check capacity
  FOR item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_id := (item->>'menu_item_id')::UUID;
    v_quantity := (item->>'quantity')::INT;
    
    -- Get capacity
    SELECT daily_capacity INTO v_capacity
    FROM public.menu_items
    WHERE id = v_item_id AND merchant_id = p_merchant_id;
    
    IF v_capacity IS NOT NULL THEN
      -- Count how many have been ordered for this date (where is_preorder is true and status != cancelled)
      SELECT COALESCE(SUM(oi.quantity), 0) INTO v_current_count
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE o.merchant_id = p_merchant_id
        AND o.is_preorder = true
        AND o.scheduled_pickup_date::DATE = p_scheduled_date
        AND o.status NOT IN ('cancelled', 'failed')
        AND oi.item_id = v_item_id;
        
      IF (v_current_count + v_quantity) > v_capacity THEN
        RETURN jsonb_build_object(
          'success', false, 
          'message', 'Capacity exceeded for item. Please select a different date or reduce quantity.',
          'item_id', v_item_id
        );
      END IF;
    END IF;
  END LOOP;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
