-- Migration: 20260909000005_fix_display_id_default.sql
-- Description: Adds a safe auto-generated default to display_id on orders
-- so that direct anonymous inserts (dine-in app) never violate the NOT NULL constraint.
-- The existing checkout Edge Function always supplies its own display_id,
-- so this default only fires when no value is provided.

ALTER TABLE public.orders 
ALTER COLUMN display_id SET DEFAULT '#DIN-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 8));
