-- =============================================================================
-- Migration: 20260903000001_tapautime_monorepo_core_schema.sql
-- Description: Core schema, enums, stock_quantity, payment_status, and RLS policies
-- =============================================================================

-- 1. Custom Enum Types
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'merchant', 'admin');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('unpaid', 'pending', 'captured', 'failed', 'refunded');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending', 'accepted', 'preparing', 'ready', 'completed', 'cancelled', 'timed_out');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 2. Users Table (synchronized with auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'customer',
    name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Merchants Table
CREATE TABLE IF NOT EXISTS public.merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    business_name TEXT NOT NULL,
    location JSONB DEFAULT '{}'::jsonb,
    is_open BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Menu Items Table (with stock_quantity for concurrency)
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 999 CHECK (stock_quantity >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Menu Item Modifiers Table (structured customization)
CREATE TABLE IF NOT EXISTS public.menu_item_modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    modifier_group TEXT NOT NULL,
    option_name TEXT NOT NULL,
    additional_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (additional_price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Orders Table (with payment_status & strict lifecycle)
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
    order_status order_status NOT NULL DEFAULT 'pending',
    payment_status payment_status NOT NULL DEFAULT 'unpaid',
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    pickup_time TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Order Items Table (with selected_modifiers JSONB snapshot)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0),
    selected_modifiers JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Row Level Security (RLS) Configuration
-- =============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Users RLS Policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- Merchants RLS Policies
DROP POLICY IF EXISTS "Public can view active merchants" ON public.merchants;
CREATE POLICY "Public can view active merchants"
    ON public.merchants FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Merchants can manage their own store" ON public.merchants;
CREATE POLICY "Merchants can manage their own store"
    ON public.merchants FOR ALL
    USING (auth.uid() = owner_id);

-- Menu Items RLS Policies
DROP POLICY IF EXISTS "Public can view menu items" ON public.menu_items;
CREATE POLICY "Public can view menu items"
    ON public.menu_items FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Merchants can manage menu items" ON public.menu_items;
CREATE POLICY "Merchants can manage menu items"
    ON public.menu_items FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.merchants
            WHERE merchants.id = menu_items.merchant_id
            AND merchants.owner_id = auth.uid()
        )
    );

-- Menu Item Modifiers RLS Policies
DROP POLICY IF EXISTS "Public can view menu item modifiers" ON public.menu_item_modifiers;
CREATE POLICY "Public can view menu item modifiers"
    ON public.menu_item_modifiers FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Merchants can manage menu item modifiers" ON public.menu_item_modifiers;
CREATE POLICY "Merchants can manage menu item modifiers"
    ON public.menu_item_modifiers FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.menu_items
            JOIN public.merchants ON merchants.id = menu_items.merchant_id
            WHERE menu_items.id = menu_item_modifiers.item_id
            AND merchants.owner_id = auth.uid()
        )
    );

-- Orders RLS Policies
DROP POLICY IF EXISTS "Customers can view their orders" ON public.orders;
CREATE POLICY "Customers can view their orders"
    ON public.orders FOR SELECT
    USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers can create orders" ON public.orders;
CREATE POLICY "Customers can create orders"
    ON public.orders FOR INSERT
    WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Merchants can view store orders" ON public.orders;
CREATE POLICY "Merchants can view store orders"
    ON public.orders FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.merchants
            WHERE merchants.id = orders.merchant_id
            AND merchants.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Merchants can update store order status" ON public.orders;
CREATE POLICY "Merchants can update store order status"
    ON public.orders FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.merchants
            WHERE merchants.id = orders.merchant_id
            AND merchants.owner_id = auth.uid()
        )
    );

-- Order Items RLS Policies
DROP POLICY IF EXISTS "Order items readable by order participants" ON public.order_items;
CREATE POLICY "Order items readable by order participants"
    ON public.order_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND (
                orders.customer_id = auth.uid() OR
                EXISTS (
                    SELECT 1 FROM public.merchants
                    WHERE merchants.id = orders.merchant_id
                    AND merchants.owner_id = auth.uid()
                )
            )
        )
    );

DROP POLICY IF EXISTS "Customers can insert order items" ON public.order_items;
CREATE POLICY "Customers can insert order items"
    ON public.order_items FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
            AND orders.customer_id = auth.uid()
        )
    );

-- 8. Enable Realtime Publications
ALTER PUBLICATION supabase_realtime ADD TABLE public.merchants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_item_modifiers;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
