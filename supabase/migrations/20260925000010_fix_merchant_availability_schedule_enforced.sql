-- =============================================================================
-- Migration: 20260925000010_fix_merchant_availability_schedule_enforced.sql
-- Fix public.merchant_availability_status to include schedule_enforced in
-- SELECT INTO v_m so that schedule automation status is correctly evaluated.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.merchant_availability_status(
    p_merchant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_m      RECORD;
    v_bounds RECORD;
    v_sched  RECORD;
    v_next   TIMESTAMPTZ;
    v_reason TEXT;
    v_enforced BOOLEAN;
BEGIN
    SELECT id, business_name, is_open, is_accepting_orders, schedule_enforced, operating_hours, timezone, order_buffer_time
      INTO v_m
      FROM public.merchants
     WHERE id = p_merchant_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_bounds
      FROM public.merchant_window_bounds(
               v_m.operating_hours, v_m.timezone, v_m.order_buffer_time, p_at);

    SELECT * INTO v_sched
      FROM public.merchant_schedule_for_date(
               v_m.operating_hours, (p_at AT TIME ZONE v_m.timezone)::DATE);

    v_enforced := COALESCE(v_m.schedule_enforced, TRUE);

    v_reason := CASE
        WHEN v_m.is_open IS NOT TRUE THEN 'MERCHANT_CLOSED'
        WHEN v_m.is_accepting_orders IS NOT TRUE THEN 'MERCHANT_PAUSED'
        WHEN v_enforced AND v_bounds.schedule_open IS NOT TRUE AND v_sched.opens IS NOT TRUE THEN 'MERCHANT_CLOSED_TODAY'
        WHEN v_enforced AND v_bounds.schedule_open IS NOT TRUE THEN 'MERCHANT_CLOSED_FOR_ORDERS'
        WHEN v_enforced AND v_bounds.last_order_at IS NOT NULL AND p_at > v_bounds.last_order_at THEN 'MERCHANT_CLOSED_FOR_ORDERS'
        ELSE NULL
    END;

    v_next := public.merchant_next_open_at(v_m.operating_hours, v_m.timezone, p_at);

    RETURN jsonb_build_object(
        'merchant_id', v_m.id,
        'business_name', v_m.business_name,
        'is_open_flag', v_m.is_open,
        'is_accepting_orders', v_m.is_accepting_orders,
        'schedule_enforced', v_enforced,
        'schedule_open', COALESCE(v_bounds.schedule_open, FALSE),
        'is_currently_open', (v_reason IS NULL),
        'reason', v_reason,
        'opens_at', v_bounds.opens_at,
        'closes_at', v_bounds.closes_at,
        'last_order_at', v_bounds.last_order_at,
        'next_open_at', v_next,
        'timezone', v_m.timezone,
        'evaluated_at', p_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.merchant_availability_status(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role;
