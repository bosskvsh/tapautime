-- =============================================================================
-- Migration: 20260911000003_create_merchant_wallet.sql
-- Description: Creates payout_requests table, links orders to payout_requests,
--              and sets up RLS policies for merchant wallet withdrawals.
-- =============================================================================

-- 1. Create payout_requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE RESTRICT,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'settled', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Alter orders table to link with payout_requests
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payout_request_id UUID REFERENCES public.payout_requests(id) ON DELETE SET NULL;

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payout_requests_merchant_id ON public.payout_requests(merchant_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests(status);
CREATE INDEX IF NOT EXISTS idx_orders_payout_request_id ON public.orders(payout_request_id);

-- 4. Enable Row Level Security
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Merchants can SELECT and INSERT their own payout requests
DROP POLICY IF EXISTS "merchants_select_own_payout_requests" ON public.payout_requests;
CREATE POLICY "merchants_select_own_payout_requests"
    ON public.payout_requests
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.merchants
            WHERE merchants.id = payout_requests.merchant_id
              AND (merchants.owner_id = (SELECT auth.uid()) OR merchants.id = (SELECT auth.uid()))
        )
    );

DROP POLICY IF EXISTS "merchants_insert_own_payout_requests" ON public.payout_requests;
CREATE POLICY "merchants_insert_own_payout_requests"
    ON public.payout_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.merchants
            WHERE merchants.id = payout_requests.merchant_id
              AND (merchants.owner_id = (SELECT auth.uid()) OR merchants.id = (SELECT auth.uid()))
        )
    );
