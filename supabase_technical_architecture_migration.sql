-- =============================================================================
-- TAPAUTIME TECHNICAL ARCHITECTURE MIGRATION
-- Aligned with: Technical Architecture: TapauTime (PRD & Core Models)
-- =============================================================================

-- 1. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('customer', 'merchant', 'admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. USERS TABLE (Linked to Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'customer',
    name TEXT NOT NULL,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. MERCHANTS TABLE
CREATE TABLE IF NOT EXISTS public.merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    business_name TEXT NOT NULL,
    location JSONB NOT NULL DEFAULT '{"lat": 3.1390, "lng": 101.6869, "address": ""}'::jsonb,
    is_open BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. MENU_ITEMS TABLE (Ensure merchant_id foreign key exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'menu_items' 
          AND column_name = 'merchant_id'
    ) THEN
        ALTER TABLE public.menu_items 
        ADD COLUMN merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 5. ORDERS TABLE (Ensure customer_id foreign key exists)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'customer_id'
    ) THEN
        ALTER TABLE public.orders 
        ADD COLUMN customer_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 6. INDEXES FOR HIGH PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_merchants_owner ON public.merchants(owner_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_merchant ON public.menu_items(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_merchant ON public.orders(merchant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);

-- 7. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Users: read own profile, update own profile, public read display name
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile" ON public.users
    FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Public can view basic user info" ON public.users;
CREATE POLICY "Public can view basic user info" ON public.users
    FOR SELECT TO anon USING (true);

-- Merchants: public can view open stalls; owner can manage
DROP POLICY IF EXISTS "Public can view merchants" ON public.merchants;
CREATE POLICY "Public can view merchants" ON public.merchants
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Owners can manage merchant" ON public.merchants;
CREATE POLICY "Owners can manage merchant" ON public.merchants
    FOR ALL TO authenticated USING (auth.uid() = owner_id);

-- 8. AUTOMATIC USER REGISTRATION TRIGGER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.users (id, role, name, phone)
    VALUES (
        new.id,
        COALESCE((new.raw_user_meta_data->>'role')::public.user_role, 'customer'),
        COALESCE(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', new.email, 'Tapau User'),
        new.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Backfill any existing auth users
INSERT INTO public.users (id, role, name, phone)
SELECT 
    id, 
    'customer'::public.user_role, 
    COALESCE(raw_user_meta_data->>'name', raw_user_meta_data->>'full_name', email, 'Tapau User'),
    raw_user_meta_data->>'phone'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 9. REALTIME PUBLICATION
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.merchants;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
