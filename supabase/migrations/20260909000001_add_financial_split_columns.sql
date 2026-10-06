-- =============================================================================
-- Migration: 20260909000001_add_financial_split_columns.sql
-- Description:
--   Adds platform_fee, merchant_cut, and payout_status to master_transactions
--   and orders tables to support Curlec fee breakdown tracking and merchant payouts.
-- =============================================================================

-- 1. Add financial split columns to public.master_transactions
ALTER TABLE public.master_transactions
    ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS merchant_cut NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'pending';

-- 2. Add financial split columns to public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS merchant_cut NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS payout_status TEXT NOT NULL DEFAULT 'pending';

-- 3. Add index on payout_status for efficient merchant payout settlement batch queries
CREATE INDEX IF NOT EXISTS idx_master_tx_payout_status ON public.master_transactions(payout_status);
CREATE INDEX IF NOT EXISTS idx_orders_payout_status ON public.orders(payout_status);
