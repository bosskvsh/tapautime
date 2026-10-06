-- =============================================================================
-- Migration: 20261001000001_allow_refunded_payment_status.sql
-- Description: 
--   1. Expands orders_payment_status_check constraint on public.orders to allow 'refunded'.
-- =============================================================================

-- 1. Drop existing payment_status check constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

-- 2. Add expanded check constraint that includes 'refunded'
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
CHECK (payment_status IN ('paid', 'pending_cash', 'captured', 'pending', 'failed', 'refunded'));
