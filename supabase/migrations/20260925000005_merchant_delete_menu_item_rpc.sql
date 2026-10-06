-- =============================================================================
-- Migration: 20260925000005_merchant_delete_menu_item_rpc.sql
-- Description:
--   Allows a merchant owner to permanently delete one of their menu items.
--   Historical order lines retain their item-name and price snapshots.
-- =============================================================================

-- The live order_items schema already snapshots the item name and paid price.
-- Keep this migration defensive for installations that predate those columns.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  ADD COLUMN IF NOT EXISTS price_at_time_of_order NUMERIC(10, 2);

CREATE OR REPLACE FUNCTION public.delete_merchant_menu_item(p_item_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.menu_items%ROWTYPE;
  v_order_item_ref_column TEXT;
  v_preserved_order_lines INTEGER := 0;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT mi.*
  INTO v_item
  FROM public.menu_items AS mi
  JOIN public.merchants AS m ON m.id = mi.merchant_id
  WHERE mi.id = p_item_id
    AND m.owner_id = (SELECT auth.uid())
  FOR UPDATE OF mi;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item not found or not authorized.'
      USING ERRCODE = '42501';
  END IF;

  -- The live order_items FK is item_id ON DELETE SET NULL, while older local
  -- schemas used menu_item_id. Resolve the actual reference column at runtime
  -- so this migration works against both without hard-coding a stale name.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'item_id'
  ) THEN
    v_order_item_ref_column := 'item_id';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'order_items'
      AND column_name = 'menu_item_id'
  ) THEN
    v_order_item_ref_column := 'menu_item_id';
  ELSE
    RAISE EXCEPTION 'order_items has no supported menu-item reference column.';
  END IF;

  EXECUTE format(
    'SELECT COUNT(*) FROM public.order_items WHERE %I = $1',
    v_order_item_ref_column
  )
  INTO v_preserved_order_lines
  USING p_item_id;

  -- Snapshot the historical line and detach it before deleting. The JSONB
  -- lookup makes the legacy unit_price column optional across installations.
  EXECUTE format(
    'UPDATE public.order_items AS oi
     SET item_name = COALESCE(oi.item_name, $1),
         price_at_time_of_order = COALESCE(
           oi.price_at_time_of_order,
           COALESCE(NULLIF(to_jsonb(oi)->>''unit_price'', '''')::numeric, 0)
         ),
         %I = NULL
     WHERE %I = $2',
    v_order_item_ref_column,
    v_order_item_ref_column
  )
  USING v_item.name, p_item_id;

  -- Direct modifiers owned by this item cascade. Modifier links from other
  -- items use ON DELETE SET NULL and remain intact.
  DELETE FROM public.menu_items
  WHERE id = p_item_id;

  RETURN jsonb_build_object(
    'success', true,
    'id', p_item_id,
    'name', v_item.name,
    'preserved_order_lines', v_preserved_order_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_merchant_menu_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_merchant_menu_item(UUID)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
