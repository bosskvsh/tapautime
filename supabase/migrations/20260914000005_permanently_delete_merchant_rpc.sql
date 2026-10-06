-- Migration: 20260914000005_permanently_delete_merchant_rpc.sql
-- Description: Adds administrative RPC to permanently delete a merchant stall and all associated records cleanly.

-- 1. Update ledger immutability trigger to allow admin cleanup when tapautime.allow_admin_cleanup is true
CREATE OR REPLACE FUNCTION public.enforce_ledger_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('tapautime.allow_admin_cleanup', true) = 'true' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Ledger entries are strictly immutable.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Create RPC function public.permanently_delete_merchant
CREATE OR REPLACE FUNCTION public.permanently_delete_merchant(p_merchant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
    v_merchant RECORD;
    v_owner_id UUID;
    v_owner_email TEXT;
    v_remaining_stalls INT;
    v_stall_name TEXT;
BEGIN
    -- Security guard: must be service_role or authenticated user with role = 'admin'
    IF current_user != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users 
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Only platform administrators can permanently delete merchants';
        END IF;
    END IF;

    -- Lock and verify merchant
    SELECT * INTO v_merchant
    FROM public.merchants
    WHERE id = p_merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Merchant with ID % not found.', p_merchant_id;
    END IF;

    v_stall_name := v_merchant.business_name;
    v_owner_id := v_merchant.owner_id;

    -- Get owner email if available
    IF v_owner_id IS NOT NULL THEN
        SELECT email INTO v_owner_email
        FROM auth.users
        WHERE id = v_owner_id;
    END IF;

    -- 1. Delete cart items (text column)
    DELETE FROM public.cart_items 
    WHERE merchant_id = p_merchant_id::text;

    -- 2. Delete merchant payment settings (uuid column)
    DELETE FROM public.merchant_payment_settings 
    WHERE merchant_id = p_merchant_id;

    -- 3. Delete store customization (text column)
    DELETE FROM public.store_customization 
    WHERE merchant_id = p_merchant_id::text;

    -- 4. Delete payout requests (uuid column)
    DELETE FROM public.payout_requests 
    WHERE merchant_id = p_merchant_id;

    -- 5. Delete ledger entries (uuid column, permit admin cleanup in local transaction)
    PERFORM set_config('tapautime.allow_admin_cleanup', 'true', true);
    DELETE FROM public.ledger_entries 
    WHERE merchant_id = p_merchant_id;

    -- 6. Delete orders and orders_v2 (orders.merchant_id is text, orders.store_id is text)
    DELETE FROM public.orders 
    WHERE merchant_id = p_merchant_id::text 
       OR store_id = p_merchant_id::text;

    DELETE FROM public.orders_v2 
    WHERE merchant_id = p_merchant_id::text;

    -- 7. Delete store name change requests (uuid column)
    DELETE FROM public.store_name_change_requests 
    WHERE merchant_id = p_merchant_id;

    -- 8. Delete menu categories and profiles if any (uuid store_id)
    DELETE FROM public.menu_categories 
    WHERE store_id = p_merchant_id;

    DELETE FROM public.merchant_profiles 
    WHERE store_id = p_merchant_id;

    -- 9. Delete menu items (cascades to modifiers)
    DELETE FROM public.menu_items 
    WHERE merchant_id = p_merchant_id 
       OR store_id = p_merchant_id;

    -- 10. Delete merchant row
    DELETE FROM public.merchants 
    WHERE id = p_merchant_id;

    -- 11. Clean up owner account if they own no other merchants
    IF v_owner_id IS NOT NULL THEN
        SELECT count(*) INTO v_remaining_stalls
        FROM public.merchants
        WHERE owner_id = v_owner_id;

        IF v_remaining_stalls = 0 THEN
            DELETE FROM auth.users WHERE id = v_owner_id;
            DELETE FROM public.users WHERE id = v_owner_id;
        END IF;
    END IF;

    -- 12. Clean up or reject merchant application if exists
    IF v_owner_email IS NOT NULL AND length(trim(v_owner_email)) > 0 THEN
        DELETE FROM public.merchant_applications 
        WHERE lower(email) = lower(trim(v_owner_email));
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Merchant "' || v_stall_name || '" and all related records have been permanently deleted.'
    );
END;
$$;

-- Grant execution to authenticated users (admin role is checked inside the function)
GRANT EXECUTE ON FUNCTION public.permanently_delete_merchant(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.permanently_delete_merchant(UUID) TO service_role;
