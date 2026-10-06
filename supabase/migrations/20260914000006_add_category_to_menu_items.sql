-- Migration: Add category column to menu_items table
-- Enables dish categorization in merchant-web and dynamic category filtering in customer-pwa

ALTER TABLE public.menu_items
ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_menu_items_category ON public.menu_items(category);
CREATE INDEX IF NOT EXISTS idx_menu_items_merchant_category ON public.menu_items(merchant_id, category);
