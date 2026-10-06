-- =============================================================================
-- Migration: 20260913000001_approve_merchant_application_rpc.sql
-- Description: Creates administrative functions to approve or reject pending
--              merchant onboarding applications atomically with full verification,
--              collision-resistant slug allocation, and merchant record creation.
-- =============================================================================

-- 1. Slug generator helper function
CREATE OR REPLACE FUNCTION public.generate_unique_merchant_slug(p_base_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_clean_slug TEXT;
    v_candidate TEXT;
    v_suffix INT := 1;
    v_exists BOOLEAN;
BEGIN
    -- Sanitize: lowercase, alphanumeric and dashes only, collapse multiple hyphens
    v_clean_slug := lower(regexp_replace(trim(p_base_name), '[^a-zA-Z0-9]+', '-', 'g'));
    v_clean_slug := trim(both '-' from v_clean_slug);

    IF v_clean_slug IS NULL OR length(v_clean_slug) = 0 THEN
        v_clean_slug := 'stall';
    END IF;

    v_candidate := v_clean_slug;

    -- Loop to find unique slug
    LOOP
        SELECT EXISTS (
            SELECT 1 FROM public.merchants WHERE slug = v_candidate
        ) INTO v_exists;

        EXIT WHEN NOT v_exists;

        v_suffix := v_suffix + 1;
        v_candidate := v_clean_slug || '-' || v_suffix::text;
    END LOOP;

    RETURN v_candidate;
END;
$$;

-- 2. Approve Merchant Application RPC
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

    -- 2. Resolve stall name and unique slug
    v_stall_name := COALESCE(NULLIF(trim(p_stall_name), ''), v_app.full_name);
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
            'menu_url', v_app.menu_url
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

-- 3. Reject Merchant Application RPC
CREATE OR REPLACE FUNCTION public.reject_merchant_application(
    p_application_id UUID,
    p_reason TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    -- Security guard: must be service_role or user with role = 'admin'
    IF coalesce(auth.role(), '') != 'service_role' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.users
            WHERE id = auth.uid() AND role = 'admin'
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Only platform administrators can reject applications';
        END IF;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.merchant_applications WHERE id = p_application_id
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION 'Application with ID % not found', p_application_id;
    END IF;

    UPDATE public.merchant_applications
    SET status = 'rejected'
    WHERE id = p_application_id;

    RETURN jsonb_build_object(
        'success', true,
        'application_id', p_application_id,
        'status', 'rejected',
        'reason', p_reason
    );
END;
$$;

-- Permissions
GRANT EXECUTE ON FUNCTION public.generate_unique_merchant_slug(TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_merchant_application(UUID, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_merchant_application(UUID, TEXT) TO authenticated, service_role;
