-- Migration: 20260925000008_header_address_color.sql
-- Description:
--   Add customizable header pill pick-up address font colour for the customer PWA merchant menu page.
--   header_address_color — self pick-up address text colour (NULL = dynamic light/dark based on background).

ALTER TABLE public.merchants
ADD COLUMN IF NOT EXISTS header_address_color TEXT;

-- Refresh the PostgREST schema cache so the new column is queryable immediately.
NOTIFY pgrst, 'reload schema';
