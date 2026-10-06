-- Migration: 20260925000001_storefront_overhaul.sql
-- Description:
--   Storefront overhaul for the customer PWA merchant menu page.
--   1. background_url  — merchant-uploaded full-page menu background (replaces the purged store banner).
--   2. menu_layout     — merchant-selected default customer menu view ('list' | 'grid').
--   3. category_images — JSONB map of category name -> image URL for the picture category tabs.
--   NOTE: banner_url is intentionally kept (historical data) but is no longer rendered anywhere.

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS background_url TEXT;

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS menu_layout TEXT NOT NULL DEFAULT 'grid'
    CHECK (menu_layout IN ('list', 'grid'));

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS category_images JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Refresh the PostgREST schema cache so the new columns are queryable immediately.
NOTIFY pgrst, 'reload schema';
