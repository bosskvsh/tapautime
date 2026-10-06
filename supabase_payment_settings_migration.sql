-- ==============================================================================
-- Migration: Create Merchant Payment Settings Table and RLS Policies
-- Target Database: Supabase / PostgreSQL
-- ==============================================================================

-- 1. Create table merchant_payment_settings
CREATE TABLE IF NOT EXISTS public.merchant_payment_settings (
    merchant_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tng_duitnow_enabled BOOLEAN NOT NULL DEFAULT false,
    tng_duitnow_id TEXT NULL,
    tng_duitnow_qr_url TEXT NULL,
    grabpay_enabled BOOLEAN NOT NULL DEFAULT false,
    grabpay_id TEXT NULL,
    fpx_enabled BOOLEAN NOT NULL DEFAULT false,
    fpx_bank_name TEXT NULL,
    fpx_account_number TEXT NULL,
    cash_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create index on merchant_id for optimal lookup performance
CREATE INDEX IF NOT EXISTS idx_merchant_payment_settings_merchant_id 
ON public.merchant_payment_settings (merchant_id);

-- 3. Create or replace automatic updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_merchant_payment_settings_updated_at ON public.merchant_payment_settings;

CREATE TRIGGER set_merchant_payment_settings_updated_at
BEFORE UPDATE ON public.merchant_payment_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.merchant_payment_settings ENABLE ROW LEVEL SECURITY;

-- 5. Strict RLS Policies (Merchants can only access their own payment settings)

-- SELECT Policy
DROP POLICY IF EXISTS "Merchants can view own payment settings" ON public.merchant_payment_settings;
CREATE POLICY "Merchants can view own payment settings"
ON public.merchant_payment_settings
FOR SELECT
TO authenticated
USING (auth.uid() = merchant_id);

-- INSERT Policy
DROP POLICY IF EXISTS "Merchants can insert own payment settings" ON public.merchant_payment_settings;
CREATE POLICY "Merchants can insert own payment settings"
ON public.merchant_payment_settings
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = merchant_id);

-- UPDATE Policy
DROP POLICY IF EXISTS "Merchants can update own payment settings" ON public.merchant_payment_settings;
CREATE POLICY "Merchants can update own payment settings"
ON public.merchant_payment_settings
FOR UPDATE
TO authenticated
USING (auth.uid() = merchant_id)
WITH CHECK (auth.uid() = merchant_id);

-- 6. Schema Grants (Principle of Least Privilege)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.merchant_payment_settings TO authenticated;

