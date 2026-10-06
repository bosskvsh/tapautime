-- Migration: 20260925000002_header_pill_colors.sql
-- Description:
--   Customizable header pill colours for the customer PWA merchant menu page.
--   1. header_bg_color   — header pill background (NULL = auto frosted white).
--   2. header_font_color — stall name + pickup text (NULL = dynamic light/dark).
--   3. header_icon_color — schedule + pin icons (NULL = default amber/white).
--   All nullable: NULL preserves the automatic dynamic look.

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS header_bg_color TEXT;

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS header_font_color TEXT;

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS header_icon_color TEXT;

-- Refresh the PostgREST schema cache so the new columns are queryable immediately.
NOTIFY pgrst, 'reload schema';
