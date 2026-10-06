-- ====================================================================
-- TAPAUTIME UNIFIED PRODUCTION-HARDENED UPGRADE (V2.1 + V3)
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Idempotent Enums
DO $$ BEGIN
    CREATE TYPE public.packaging_fee_enum AS ENUM ('per_item', 'per_order', 'none');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.ledger_entry_type AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_method_enum AS ENUM ('gateway', 'manual_transfer', 'cash');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.menu_item_type_enum AS ENUM ('standard', 'budget_tier');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Update payment_status enum with all required statuses
DO $$ BEGIN
    ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'unpaid';
    ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'captured';
    ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'failed';
    ALTER TYPE public.payment_status ADD VALUE IF NOT EXISTS 'refunded';
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
END $$;

-- Update order_status enum with all required statuses
DO $$ BEGIN
    ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'pending';
    ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'accepted';
    ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'preparing';
    ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'ready';
    ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'completed';
    ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'cancelled';
    ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'timed_out';
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN undefined_object THEN null;
END $$;

-- 2. Organizations & Parent Hubs
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.parent_hubs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    location JSONB NOT NULL DEFAULT '{"lat": 3.1390, "lng": 101.6869, "address": ""}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Users Table Update (Anti-fraud trust scoring)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS successful_orders_count INT NOT NULL DEFAULT 0;

-- 4. Merchants Table Update
ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS hub_id UUID REFERENCES public.parent_hubs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS packaging_fee_type public.packaging_fee_enum NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS packaging_fee_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (packaging_fee_amount >= 0),
ADD COLUMN IF NOT EXISTS order_buffer_time INT NOT NULL DEFAULT 15 CHECK (order_buffer_time >= 0), 
ADD COLUMN IF NOT EXISTS current_prep_delay INT NOT NULL DEFAULT 0 CHECK (current_prep_delay >= 0),
ADD COLUMN IF NOT EXISTS is_surge_mode BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_merchants_hub_id ON public.merchants(hub_id);
CREATE INDEX IF NOT EXISTS idx_merchants_org_id ON public.merchants(org_id);
CREATE INDEX IF NOT EXISTS idx_merchants_heartbeat ON public.merchants(id, last_seen);

-- 5. Master Transactions (Hub & Spoke Payments)
CREATE TABLE IF NOT EXISTS public.master_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    hub_id UUID REFERENCES public.parent_hubs(id) ON DELETE SET NULL,
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    payment_method public.payment_method_enum NOT NULL DEFAULT 'gateway',
    payment_status TEXT NOT NULL DEFAULT 'pending', 
    receipt_url TEXT, 
    pickup_pin VARCHAR(4) NOT NULL, -- 4-digit Auntie-proof OTP
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_tx_customer ON public.master_transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_master_tx_hub ON public.master_transactions(hub_id);
CREATE INDEX IF NOT EXISTS idx_master_tx_pickup_pin ON public.master_transactions(pickup_pin);

-- 6. Sub-Orders (OCC, Idempotency & Handoff)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.master_transactions(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS pickup_pin VARCHAR(4),
ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
ADD COLUMN IF NOT EXISTS stock_reserved_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS target_prep_start_time TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS packaging_fee_charged NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (packaging_fee_charged >= 0);

CREATE INDEX IF NOT EXISTS idx_orders_transaction_id ON public.orders(transaction_id);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON public.orders(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_orders_occ_version ON public.orders(id, version);
CREATE INDEX IF NOT EXISTS idx_orders_pickup_pin ON public.orders(pickup_pin);

-- OCC Trigger
CREATE OR REPLACE FUNCTION public.increment_order_occ_version()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version = OLD.version + 1;
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_increment_order_version ON public.orders;
CREATE TRIGGER trg_increment_order_version
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.increment_order_occ_version();

-- 7. Immutable Ledger (Sub-Cent Financial Math)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID REFERENCES public.master_transactions(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
    type public.ledger_entry_type NOT NULL,
    amount NUMERIC(12,4) NOT NULL CHECK (amount >= 0), -- Sub-cent commission precision
    description TEXT NOT NULL, 
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_merchant_id ON public.ledger_entries(merchant_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction_id ON public.ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON public.ledger_entries(created_at);

-- Enforce Strict Immutability Trigger
CREATE OR REPLACE FUNCTION public.enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries are strictly immutable.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ledger_immutability ON public.ledger_entries;
CREATE TRIGGER trg_ledger_immutability
    BEFORE UPDATE OR DELETE ON public.ledger_entries
    FOR EACH ROW EXECUTE FUNCTION public.enforce_ledger_immutability();

-- 8. Menu & Modifiers (Inheritance, Budget Tier, Nutrition)
ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS item_type public.menu_item_type_enum NOT NULL DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS nutritional_info JSONB NOT NULL DEFAULT '{"calories": 0, "protein": 0, "carbs": 0, "fat": 0}'::jsonb, 
ADD COLUMN IF NOT EXISTS search_tags TEXT[] NOT NULL DEFAULT '{}'::text[];

-- Allow merchant_id to be NULL for Organization master menus
ALTER TABLE public.menu_items ALTER COLUMN merchant_id DROP NOT NULL;

-- Validate that item belongs to either an organization or merchant
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_menu_item_owner'
    ) THEN
        ALTER TABLE public.menu_items
        ADD CONSTRAINT chk_menu_item_owner
        CHECK (org_id IS NOT NULL OR merchant_id IS NOT NULL);
    END IF;
END $$;

ALTER TABLE public.menu_item_modifiers
ADD COLUMN IF NOT EXISTS linked_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS nutritional_info JSONB NOT NULL DEFAULT '{"calories": 0, "protein": 0, "carbs": 0, "fat": 0}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_menu_items_search_tags ON public.menu_items USING GIN (search_tags);
CREATE INDEX IF NOT EXISTS idx_menu_items_nutrition ON public.menu_items USING GIN (nutritional_info jsonb_path_ops);

-- 9. Dietary Macro & Full-Text Search RPC
CREATE OR REPLACE FUNCTION public.search_menu_items(
    p_merchant_id UUID DEFAULT NULL,
    p_org_id UUID DEFAULT NULL,
    p_query TEXT DEFAULT NULL,
    p_max_calories NUMERIC DEFAULT NULL,
    p_min_protein NUMERIC DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL
)
RETURNS SETOF public.menu_items AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM public.menu_items
    WHERE is_available = true
      AND (
          (p_merchant_id IS NOT NULL AND merchant_id = p_merchant_id)
          OR (p_org_id IS NOT NULL AND org_id = p_org_id)
          OR (p_merchant_id IS NULL AND p_org_id IS NULL)
      )
      AND (
          p_query IS NULL 
          OR p_query = ''
          OR name ILIKE '%' || p_query || '%'
          OR description ILIKE '%' || p_query || '%'
          OR to_tsvector('english', name || ' ' || COALESCE(description, '')) @@ plainto_tsquery('english', p_query)
      )
      AND (
          p_max_calories IS NULL 
          OR (nutritional_info->>'calories')::NUMERIC <= p_max_calories
      )
      AND (
          p_min_protein IS NULL 
          OR (nutritional_info->>'protein')::NUMERIC >= p_min_protein
      )
      AND (
          p_tags IS NULL 
          OR p_tags <@ search_tags
      )
    ORDER BY bestseller DESC NULLS LAST, name ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 10. Row Level Security (Complete with Working Policies)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_hubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read organizations" ON public.organizations;
CREATE POLICY "Public can read organizations" ON public.organizations FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can read parent hubs" ON public.parent_hubs;
CREATE POLICY "Public can read parent hubs" ON public.parent_hubs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Customers read own transactions" ON public.master_transactions;
CREATE POLICY "Customers read own transactions" ON public.master_transactions FOR SELECT USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Customers create transactions" ON public.master_transactions;
CREATE POLICY "Customers create transactions" ON public.master_transactions FOR INSERT WITH CHECK (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Merchants can view transactions for their orders" ON public.master_transactions;
CREATE POLICY "Merchants can view transactions for their orders" ON public.master_transactions FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders
        JOIN public.merchants ON merchants.id = orders.merchant_id
        WHERE orders.transaction_id = master_transactions.id
          AND merchants.owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Merchants read own ledger" ON public.ledger_entries;
CREATE POLICY "Merchants read own ledger" ON public.ledger_entries FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.merchants 
        WHERE merchants.id = ledger_entries.merchant_id 
          AND merchants.owner_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Service role can insert ledger entries" ON public.ledger_entries;
CREATE POLICY "Service role can insert ledger entries" ON public.ledger_entries FOR INSERT WITH CHECK (true);

-- 11. Realtime Publications
DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.parent_hubs;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.organizations;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.master_transactions;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ledger_entries;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
