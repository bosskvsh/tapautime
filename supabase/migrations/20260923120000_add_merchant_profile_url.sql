-- =============================================================================
-- Migration: 20260923120000_add_merchant_profile_url.sql
-- Description:
--   Adds profile_url column to public.merchants table for merchant profile photos.
--   This is separate from banner_url (storefront banner) and allows merchants
--   to upload a dedicated profile photo displayed in the customer PWA merchant
--   list page (HawkerCard).
-- =============================================================================

-- 1. Add profile_url column to merchants table
ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS profile_url TEXT;

-- 2. Add storage update & delete policies on merchant-assets bucket (inherited from existing policies)
-- The existing bucket policies should cover this since they use the same bucket.

-- 3. Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_merchants_profile_url ON public.merchants(profile_url) WHERE profile_url IS NOT NULL;