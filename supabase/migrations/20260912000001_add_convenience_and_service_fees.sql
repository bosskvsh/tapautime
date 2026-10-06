-- =============================================================================
-- Migration: 20260912000001_add_convenience_and_service_fees.sql
-- Description:
--   Adds convenience_fee and service_fee to master_transactions and orders tables.
--   - Convenience fee: Flat rate RM 0.38
--   - Service fee: Dynamic 1.8% of cart subtotal
-- =============================================================================

-- 1. Add convenience_fee and service_fee to public.master_transactions
ALTER TABLE public.master_transactions
    ADD COLUMN IF NOT EXISTS convenience_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS service_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00;

-- 2. Add convenience_fee and service_fee to public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS convenience_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS service_fee NUMERIC(10,2) NOT NULL DEFAULT 0.00;
