-- Migration: 20260925000009_category_order.sql
-- Description:
--   Add customizable category tab arrangement order for the Storefront Studio and Customer PWA menu page.
--   category_order — JSONB array of strings defining the custom display sequence of category tabs.

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS category_order JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Refresh the PostgREST schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
