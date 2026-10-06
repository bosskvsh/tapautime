-- Migration: 20260924000002_grid_tile_colors.sql
-- Description:
--   Customizable grid-layout tile colours for the customer PWA merchant menu page.
--   1. grid_card_bg_color    — grid tile caption background (default white).
--   2. grid_item_name_color  — grid tile item-name text (default stone-900).
--   3. grid_price_color      — grid tile price text (default brand orange).
--   Timestamped before 20260925000001_storefront_overhaul.sql so it applies first in order.

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS grid_card_bg_color TEXT NOT NULL DEFAULT '#FFFFFF';

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS grid_item_name_color TEXT NOT NULL DEFAULT '#1C1917';

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS grid_price_color TEXT NOT NULL DEFAULT '#E86A1C';

-- Refresh the PostgREST schema cache so the new columns are queryable immediately.
NOTIFY pgrst, 'reload schema';
