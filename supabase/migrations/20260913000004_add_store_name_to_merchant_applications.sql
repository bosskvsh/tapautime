-- =============================================================================
-- Migration: 20260913000004_add_store_name_to_merchant_applications.sql
-- Description: Adds store_name column to public.merchant_applications and
--              updates approve_merchant_application RPC to adopt store_name as
--              the primary stall business name.
-- =============================================================================

-- 1. Add store_name column to merchant_applications
ALTER TABLE public.merchant_applications
ADD COLUMN IF NOT EXISTS store_name TEXT;

-- 2. Update approve_merchant_application RPC to support store_name
CREATE OR REPLACE FUNCTION public.approve_merchant_application(
    p_application_id UUID,
    p_auth_user_id UUID DEFAULT NULL,
    p_stall_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_app RECORD;
    v_target_user_id UUID;
    v_stall_name TEXT;
    v_slug TEXT;
    v_merchant_id UUID;
BEGIN
    -- Security guard: must be service_role or user with role = 'admin'
    IF coalesce(auth.role(), '') != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Only platform administrators can approve applications';
        END IF;
    END IF;

    -- Lock and retrieve application
    SELECT *
    INTO v_app
    FROM public.merchant_applications
    WHERE id = p_application_id
    FOR UPDATE;

    IF v_app.id IS NULL THEN
        RAISE EXCEPTION 'Application with ID % not found', p_application_id;
    END IF;

    IF v_app.status = 'approved' THEN
        RAISE EXCEPTION 'Application % is already approved', p_application_id;
    END IF;

    -- Resolve auth user: passed ID takes precedence, fallback to matching auth.users by email
    IF p_auth_user_id IS NOT NULL THEN
        v_target_user_id := p_auth_user_id;
    ELSE
        SELECT id INTO v_target_user_id
        FROM auth.users
        WHERE email = v_app.email
        LIMIT 1;
    END IF;

    IF v_target_user_id IS NULL THEN
        RAISE EXCEPTION 'No auth.users account found for email %. Create auth user prior to approval.', v_app.email;
    END IF;

    -- 1. Ensure public.users entry with role 'merchant'
    INSERT INTO public.users (id, role, name, phone)
    VALUES (v_target_user_id, 'merchant', v_app.full_name, v_app.phone_number)
    ON CONFLICT (id) DO UPDATE
    SET role = 'merchant',
        name = COALESCE(public.users.name, EXCLUDED.name),
        phone = COALESCE(public.users.phone, EXCLUDED.phone);

    -- 2. Resolve stall name and unique slug (prefer explicit param -> application store_name -> applicant full_name)
    v_stall_name := COALESCE(NULLIF(trim(p_stall_name), ''), NULLIF(trim(v_app.store_name), ''), v_app.full_name);
    v_slug := public.generate_unique_merchant_slug(v_stall_name);

    -- 3. Provision or link public.merchants record
    INSERT INTO public.merchants (
        owner_id,
        business_name,
        slug,
        location,
        is_open
    ) VALUES (
        v_target_user_id,
        v_stall_name,
        v_slug,
        jsonb_build_object(
            'bank_name', v_app.bank_name,
            'bank_account_number', v_app.bank_account_number,
            'mykad_number', v_app.mykad_number,
            'menu_url', v_app.menu_url,
            'store_name', v_app.store_name
        ),
        true
    )
    RETURNING id INTO v_merchant_id;

    -- 4. Mark application approved
    UPDATE public.merchant_applications
    SET status = 'approved'
    WHERE id = p_application_id;

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'merchant_id', v_merchant_id,
        'owner_id', v_target_user_id,
        'business_name', v_stall_name,
        'slug', v_slug,
        'status', 'approved'
    );
END;
$$;
