-- Fix modifier single_select defaults for non-addon choice groups
-- Groups like Hot/Ice, Temperature, Flavours, Choice of Milk, Ice Level must be single-select.

UPDATE public.menu_item_modifiers
SET is_single_select = true
WHERE modifier_group NOT ILIKE '%add-on%'
  AND modifier_group NOT ILIKE '%addon%'
  AND modifier_group NOT ILIKE '%extra%'
  AND modifier_group NOT ILIKE '%topping%'
  AND modifier_group NOT ILIKE '%side%';
