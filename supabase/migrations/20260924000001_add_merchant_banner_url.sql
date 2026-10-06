-- Migration: 20260924000001_add_merchant_banner_url.sql
-- Description:
--   Adds banner_url column to public.merchants table for the storefront banner
--   (menu page cover) uploaded from merchant Store Settings. Separate from
--   profile_url (customer merchant-list avatar) and image_url (legacy cover).

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS banner_url TEXT;

CREATE INDEX IF NOT EXISTS idx_merchants_banner_url
    ON public.merchants(banner_url) WHERE banner_url IS NOT NULL;

-- Refresh the PostgREST schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
