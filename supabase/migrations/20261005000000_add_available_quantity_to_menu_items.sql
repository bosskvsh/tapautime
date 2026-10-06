-- Migration: 20261005000000_add_available_quantity_to_menu_items.sql

-- 1. Add available_quantity column to public.menu_items
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS available_quantity INTEGER DEFAULT NULL
    CHECK (available_quantity IS NULL OR available_quantity >= 0);

-- 2. Update checkout_atomic_reservation
CREATE OR REPLACE FUNCTION public.checkout_atomic_reservation(
    p_items JSONB -- Array of items: [{"item_id": "...", "quantity": 1}, ...]
)
RETURNS JSONB AS $$
DECLARE
    v_item RECORD;
    v_reserved_list JSONB := '[]'::jsonb;
    v_expected_count INT;
BEGIN
    -- 1. Validate input presence
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Items array cannot be empty.';
    END IF;

    -- Count distinct valid item UUIDs requested
    SELECT count(DISTINCT (COALESCE(elem->>'item_id', elem->>'id'))::UUID)
    INTO v_expected_count
    FROM jsonb_array_elements(p_items) AS elem
    WHERE COALESCE(elem->>'item_id', elem->>'id') IS NOT NULL;

    IF v_expected_count = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: No valid item UUIDs provided.';
    END IF;

    -- 2. Consolidate quantities & sort by item_id to mathematically prevent deadlocks
    FOR v_item IN
        WITH parsed_items AS (
            SELECT 
                (COALESCE(elem->>'item_id', elem->>'id'))::UUID AS item_id,
                GREATEST(COALESCE((elem->>'quantity')::INT, (elem->>'qty')::INT, 1), 0) AS quantity
            FROM jsonb_array_elements(p_items) AS elem
        ),
        aggregated_items AS (
            SELECT 
                item_id, 
                SUM(quantity)::INT AS total_quantity
            FROM parsed_items
            WHERE item_id IS NOT NULL
            GROUP BY item_id
            ORDER BY item_id ASC
        )
        SELECT 
            ai.item_id,
            ai.total_quantity,
            mi.name AS item_name,
            mi.available_quantity,
            mi.is_available
        FROM aggregated_items ai
        JOIN public.menu_items mi ON mi.id = ai.item_id
        FOR UPDATE OF mi
    LOOP
        -- 3. Check item availability
        IF NOT v_item.is_available THEN
            RAISE EXCEPTION 'ITEM_UNAVAILABLE: Item "%" (%) is currently marked unavailable.', 
                v_item.item_name, v_item.item_id;
        END IF;

        -- 4. Check stock threshold & decrement if not unlimited
        IF v_item.available_quantity IS NOT NULL THEN
            IF v_item.available_quantity < v_item.total_quantity THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item "%" (%) only has % left in stock, but % was requested.',
                    v_item.item_name, v_item.item_id, v_item.available_quantity, v_item.total_quantity;
            END IF;

            -- 5. Decrement stock atomically
            UPDATE public.menu_items
            SET 
                available_quantity = available_quantity - v_item.total_quantity,
                is_available = ((available_quantity - v_item.total_quantity) > 0),
                updated_at = now()
            WHERE id = v_item.item_id;

            -- 6. Collect reservation summary
            v_reserved_list := v_reserved_list || jsonb_build_object(
                'item_id', v_item.item_id,
                'name', v_item.item_name,
                'reserved_quantity', v_item.total_quantity,
                'remaining_stock', v_item.available_quantity - v_item.total_quantity
            );
        ELSE
            -- Unlimited stock, just record reservation
            v_reserved_list := v_reserved_list || jsonb_build_object(
                'item_id', v_item.item_id,
                'name', v_item.item_name,
                'reserved_quantity', v_item.total_quantity,
                'remaining_stock', null
            );
        END IF;
    END LOOP;

    -- 7. Ensure all requested items existed
    IF jsonb_array_length(v_reserved_list) < v_expected_count THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND: One or more requested menu items do not exist in menu_items.';
    END IF;

    -- 8. Return structured success payload for Edge Function
    RETURN jsonb_build_object(
        'success', true,
        'reserved_count', jsonb_array_length(v_reserved_list),
        'reserved_items', v_reserved_list,
        'timestamp', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 3. Update release_atomic_reservation
CREATE OR REPLACE FUNCTION public.release_atomic_reservation(
    p_items JSONB -- Array of items: [{"item_id": "...", "quantity": 1}, ...]
)
RETURNS JSONB AS $$
DECLARE
    v_item RECORD;
    v_released_list JSONB := '[]'::jsonb;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', true, 'released_count', 0, 'released_items', '[]'::jsonb);
    END IF;

    FOR v_item IN
        WITH parsed_items AS (
            SELECT 
                (COALESCE(elem->>'item_id', elem->>'id'))::UUID AS item_id,
                GREATEST(COALESCE((elem->>'quantity')::INT, (elem->>'qty')::INT, 1), 0) AS quantity
            FROM jsonb_array_elements(p_items) AS elem
        ),
        aggregated_items AS (
            SELECT 
                item_id, 
                SUM(quantity)::INT AS total_quantity
            FROM parsed_items
            WHERE item_id IS NOT NULL
            GROUP BY item_id
            ORDER BY item_id ASC
        )
        SELECT 
            ai.item_id,
            ai.total_quantity,
            mi.name AS item_name,
            mi.available_quantity
        FROM aggregated_items ai
        JOIN public.menu_items mi ON mi.id = ai.item_id
        FOR UPDATE OF mi -- Row-level lock in deterministic ascending order
    LOOP
        IF v_item.available_quantity IS NOT NULL THEN
            UPDATE public.menu_items
            SET 
                available_quantity = available_quantity + v_item.total_quantity,
                is_available = true,
                updated_at = now()
            WHERE id = v_item.item_id;

            v_released_list := v_released_list || jsonb_build_object(
                'item_id', v_item.item_id,
                'name', v_item.item_name,
                'restored_quantity', v_item.total_quantity,
                'restored_stock', v_item.available_quantity + v_item.total_quantity
            );
        ELSE
            -- Unlimited stock, no need to restore stock count, just log
            v_released_list := v_released_list || jsonb_build_object(
                'item_id', v_item.item_id,
                'name', v_item.item_name,
                'restored_quantity', v_item.total_quantity,
                'restored_stock', null
            );
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'released_count', jsonb_array_length(v_released_list),
        'released_items', v_released_list,
        'timestamp', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
