-- =============================================================================
-- TAPAUTIME ARCHITECTURE V2: MODIFIERS, STOCK CONCURRENCY & PAYMENT STATUS
-- =============================================================================

-- 1. PAYMENT STATUS ENUM
DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'captured', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. UPDATE ORDER_STATUS ENUM (Add 'timed_out' if not present)
DO $$ BEGIN
    ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'timed_out';
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
END $$;

-- 3. MENU_ITEMS: Add stock_quantity for concurrency control
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS stock_quantity INT NOT NULL DEFAULT 100 CHECK (stock_quantity >= 0);

-- 4. MENU_ITEM_MODIFIERS TABLE
CREATE TABLE IF NOT EXISTS public.menu_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    modifier_group TEXT NOT NULL, -- e.g., "Sugar Level", "Add-ons", "Spice Level"
    option_name TEXT NOT NULL,    -- e.g., "Kurang Manis", "Tambah Telur"
    additional_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (additional_price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_modifiers_item ON public.menu_item_modifiers(item_id);

-- 5. ORDERS TABLE: Add payment_status column
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS payment_status payment_status NOT NULL DEFAULT 'pending';

-- 6. ORDER_ITEMS TABLE: Add selected_modifiers JSONB column
ALTER TABLE public.order_items
ADD COLUMN IF NOT EXISTS selected_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 7. ROW LEVEL SECURITY ON MODIFIERS
ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view modifiers" ON public.menu_item_modifiers;
CREATE POLICY "Public can view modifiers" ON public.menu_item_modifiers
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Merchants can manage own modifiers" ON public.menu_item_modifiers;
CREATE POLICY "Merchants can manage own modifiers" ON public.menu_item_modifiers
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.menu_items
            JOIN public.merchants ON merchants.id = menu_items.merchant_id
            WHERE menu_items.id = menu_item_modifiers.item_id
              AND merchants.owner_id = auth.uid()
        )
    );

-- 8. Add menu_item_modifiers to realtime publication
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_item_modifiers;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 9. ATOMIC STOCK DECREMENT & CHECKOUT RPC FUNCTION
CREATE OR REPLACE FUNCTION public.process_order_checkout(
    p_customer_id UUID,
    p_merchant_id UUID,
    p_items JSONB, -- Array: [{"item_id": "...", "quantity": 1, "modifiers": [...]}]
    p_total_amount NUMERIC
)
RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_item_id UUID;
    v_qty INT;
    v_current_stock INT;
BEGIN
    -- 1. Validate and decrement stock atomically with row-level locks
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_id := (v_item->>'item_id')::UUID;
        v_qty := (v_item->>'quantity')::INT;

        SELECT stock_quantity INTO v_current_stock
        FROM public.menu_items
        WHERE id = v_item_id AND is_available = true
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item % not found or unavailable', v_item_id;
        END IF;

        IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'Insufficient stock for item %. Available: %, Requested: %', 
                v_item_id, v_current_stock, v_qty;
        END IF;

        UPDATE public.menu_items
        SET stock_quantity = stock_quantity - v_qty,
            is_available = ((stock_quantity - v_qty) > 0)
        WHERE id = v_item_id;
    END LOOP;

    -- 2. Create the order
    INSERT INTO public.orders (customer_id, merchant_id, status, payment_status, total_amount)
    VALUES (p_customer_id, p_merchant_id, 'pending', 'pending', p_total_amount)
    RETURNING id INTO v_order_id;

    -- 3. Insert order items with selected modifiers snapshot
    INSERT INTO public.order_items (order_id, item_id, quantity, selected_modifiers)
    SELECT 
        v_order_id,
        (i->>'item_id')::UUID,
        (i->>'quantity')::INT,
        COALESCE(i->'modifiers', '[]'::jsonb)
    FROM jsonb_array_elements(p_items) AS i;

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
