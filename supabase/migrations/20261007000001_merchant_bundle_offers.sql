-- =============================================================================
-- Migration: 20261007000001_merchant_bundle_offers.sql
-- Description:
--   Merchant bundle offers configuration (e.g. 'buy 2 at a fixed price'
--   or 'buy 3 at a fixed price') with merchant RLS policies.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.merchant_bundle_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    bundle_type TEXT NOT NULL CHECK (bundle_type IN ('buy_2_fixed_price', 'buy_3_fixed_price')),
    title TEXT NOT NULL,
    fixed_price NUMERIC(10, 2) NOT NULL CHECK (fixed_price > 0),
    applicable_to TEXT NOT NULL DEFAULT 'both' CHECK (applicable_to IN ('tapau', 'dine_in', 'both')),
    item_ids UUID[] DEFAULT '{}'::uuid[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT merchant_bundle_offers_title_length CHECK (char_length(title) >= 1 AND char_length(title) <= 100)
);

CREATE INDEX IF NOT EXISTS idx_merchant_bundle_offers_merchant_created
    ON public.merchant_bundle_offers (merchant_id, created_at DESC);

ALTER TABLE public.merchant_bundle_offers ENABLE ROW LEVEL SECURITY;

-- Merchants can read own bundle offers
DROP POLICY IF EXISTS "Merchants can read own bundle offers" ON public.merchant_bundle_offers;
CREATE POLICY "Merchants can read own bundle offers"
    ON public.merchant_bundle_offers
    FOR SELECT
    TO authenticated
    USING (
        merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

-- Merchants can insert own bundle offers
DROP POLICY IF EXISTS "Merchants can insert own bundle offers" ON public.merchant_bundle_offers;
CREATE POLICY "Merchants can insert own bundle offers"
    ON public.merchant_bundle_offers
    FOR INSERT
    TO authenticated
    WITH CHECK (
        merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

-- Merchants can update own bundle offers
DROP POLICY IF EXISTS "Merchants can update own bundle offers" ON public.merchant_bundle_offers;
CREATE POLICY "Merchants can update own bundle offers"
    ON public.merchant_bundle_offers
    FOR UPDATE
    TO authenticated
    USING (
        merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    )
    WITH CHECK (
        merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

-- Merchants can delete own bundle offers
DROP POLICY IF EXISTS "Merchants can delete own bundle offers" ON public.merchant_bundle_offers;
CREATE POLICY "Merchants can delete own bundle offers"
    ON public.merchant_bundle_offers
    FOR DELETE
    TO authenticated
    USING (
        merchant_id IN (
            SELECT id
            FROM public.merchants
            WHERE owner_id = (SELECT auth.uid())
        )
    );

-- Public / anon can read active bundle offers for storefront display
DROP POLICY IF EXISTS "Public can view active bundle offers" ON public.merchant_bundle_offers;
CREATE POLICY "Public can view active bundle offers"
    ON public.merchant_bundle_offers
    FOR SELECT
    TO anon, authenticated
    USING (is_active = true);

-- Table grants for PostgREST
GRANT ALL ON public.merchant_bundle_offers TO authenticated;
GRANT SELECT ON public.merchant_bundle_offers TO anon;

-- Add to Realtime publication
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.merchant_bundle_offers;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
