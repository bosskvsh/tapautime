-- Add is_single_select column to menu_item_modifiers
ALTER TABLE public.menu_item_modifiers
ADD COLUMN IF NOT EXISTS is_single_select BOOLEAN DEFAULT false;
