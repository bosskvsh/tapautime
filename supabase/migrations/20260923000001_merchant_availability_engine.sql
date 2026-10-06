-- =============================================================================
-- Migration: 20260923000001_merchant_availability_engine.sql
-- Description:
--   1. Adds timezone + is_accepting_orders (operator pause) to public.merchants.
--   2. Centralises the availability rule in SQL (single source of truth):
--        hhmm_to_minutes(time, default)                   -> int
--        merchant_schedule_for_date(op_hours, date)       -> (opens, open_min, close_min)
--        merchant_schedule_open(op_hours, tz, at)         -> boolean
--        merchant_window_bounds(op_hours, tz, buffer, at) -> (schedule_open, opens_at, closes_at, last_order_at)
--        merchant_next_open_at(op_hours, tz, at)          -> timestamptz
--        merchant_availability_status(merchant_id, at)    -> jsonb
--        is_merchant_accepting_now(merchant_id, at)       -> boolean
--   3. Exposes public.merchant_availability view so every client renders a
--      DERIVED availability state instead of a stale stored boolean.
--   4. Supports operating_hours.exceptions, keyed by YYYY-MM-DD with value null
--      (closed all day) or {open, close} (special hours).
--
-- Effective availability = merchants.is_open               (master switch / admin)
--                      AND merchants.is_accepting_orders   (merchant pause)
--                      AND schedule_open(now)
--                      AND now <= closes_at - order_buffer_time
-- =============================================================================

-- 1. New columns --------------------------------------------------------------
ALTER TABLE public.merchants
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'Asia/Kuching';

ALTER TABLE public.merchants
    ADD COLUMN IF NOT EXISTS is_accepting_orders BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.merchants
    ADD COLUMN IF NOT EXISTS schedule_enforced BOOLEAN NOT NULL DEFAULT true;

UPDATE public.merchants SET is_accepting_orders = true WHERE is_accepting_orders IS NULL;
UPDATE public.merchants SET schedule_enforced = true WHERE schedule_enforced IS NULL;
UPDATE public.merchants SET timezone = 'Asia/Kuching' WHERE timezone IS NULL OR btrim(timezone) = '';

-- 2. Pure schedule helpers ----------------------------------------------------

-- Parse HH:mm into minutes-of-day (0..1439) with a safe fallback.
CREATE OR REPLACE FUNCTION public.hhmm_to_minutes(p_time TEXT, p_default INT DEFAULT 0)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN COALESCE(p_time, '') ~ '^[0-9]{1,2}:[0-9]{2}$' THEN
            LEAST(
                1439,
                GREATEST(
                    0,
                    split_part(p_time, ':', 1)::INT * 60 + split_part(p_time, ':', 2)::INT
                )
            )
        ELSE p_default
    END;
$$;

-- Resolve the schedule for one local calendar date (honours exceptions + day mask).
CREATE OR REPLACE FUNCTION public.merchant_schedule_for_date(p_op_hours JSONB, p_date DATE)
RETURNS TABLE (opens BOOLEAN, open_min INT, close_min INT)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_op        JSONB := COALESCE(p_op_hours, '{}'::JSONB);
    v_days      INT[];
    v_dow       INT  := EXTRACT(DOW FROM p_date)::INT;
    v_key       TEXT := to_char(p_date, 'YYYY-MM-DD');
    v_exception JSONB;
    v_open      TEXT := COALESCE(NULLIF(v_op->>'open', ''), '07:00');
    v_close     TEXT := COALESCE(NULLIF(v_op->>'close', ''), '22:00');
BEGIN
    IF jsonb_typeof(v_op->'days') = 'array' THEN
        SELECT array_agg(elem::INT) INTO v_days
        FROM jsonb_array_elements_text(v_op->'days') AS elem;
    END IF;
    v_days := COALESCE(v_days, ARRAY[0, 1, 2, 3, 4, 5, 6]);

    IF jsonb_typeof(v_op->'exceptions') = 'object' THEN
        v_exception := v_op->'exceptions';
    END IF;

    IF v_exception IS NOT NULL AND v_exception ? v_key THEN
        IF COALESCE(jsonb_typeof(v_exception->v_key), 'null') = 'null' THEN
            RETURN QUERY SELECT FALSE, 0, 0;
            RETURN;
        END IF;
        v_open  := COALESCE(NULLIF(v_exception->v_key->>'open', ''), v_open);
        v_close := COALESCE(NULLIF(v_exception->v_key->>'close', ''), v_close);
    ELSIF NOT (v_dow = ANY (v_days)) THEN
        RETURN QUERY SELECT FALSE, 0, 0;
        RETURN;
    END IF;

    RETURN QUERY SELECT
        TRUE,
        public.hhmm_to_minutes(v_open, 420),
        public.hhmm_to_minutes(v_close, 1320);
END;
$$;

-- Is the stall inside its configured service window right now?
CREATE OR REPLACE FUNCTION public.merchant_schedule_open(p_op_hours JSONB, p_timezone TEXT, p_at TIMESTAMPTZ)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_tz      TEXT      := COALESCE(NULLIF(btrim(p_timezone), ''), 'Asia/Kuching');
    v_local   TIMESTAMP := (p_at AT TIME ZONE v_tz);
    v_minutes INT       := EXTRACT(HOUR FROM (p_at AT TIME ZONE v_tz))::INT * 60
                         + EXTRACT(MINUTE FROM (p_at AT TIME ZONE v_tz))::INT;
    v_sched   RECORD;
BEGIN
    SELECT * INTO v_sched
    FROM public.merchant_schedule_for_date(p_op_hours, v_local::DATE);

    IF v_sched.opens IS NOT TRUE THEN
        RETURN FALSE;
    END IF;

    -- A window whose close time is not after its open time wraps past midnight.
    IF v_sched.close_min <= v_sched.open_min THEN
        RETURN v_minutes >= v_sched.open_min OR v_minutes < v_sched.close_min;
    END IF;

    RETURN v_minutes >= v_sched.open_min AND v_minutes < v_sched.close_min;
END;
$$;

-- Window boundaries for the window covering p_at (plus the last-order cutoff).
CREATE OR REPLACE FUNCTION public.merchant_window_bounds(
    p_op_hours JSONB,
    p_timezone TEXT,
    p_buffer_minutes INT DEFAULT 15,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (schedule_open BOOLEAN, opens_at TIMESTAMPTZ, closes_at TIMESTAMPTZ, last_order_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_tz       TEXT      := COALESCE(NULLIF(btrim(p_timezone), ''), 'Asia/Kuching');
    v_minutes  INT       := EXTRACT(HOUR FROM (p_at AT TIME ZONE v_tz))::INT * 60
                          + EXTRACT(MINUTE FROM (p_at AT TIME ZONE v_tz))::INT;
    v_buffer   INT       := GREATEST(COALESCE(p_buffer_minutes, 15), 0);
    v_day      DATE      := (p_at AT TIME ZONE v_tz)::DATE;
    v_sched    RECORD;
    v_open_ts  TIMESTAMPTZ;
    v_close_ts TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_sched FROM public.merchant_schedule_for_date(p_op_hours, v_day);

    -- We may still be inside an overnight window that started on the previous local day.
    IF v_sched.opens IS TRUE
       AND v_sched.close_min <= v_sched.open_min
       AND v_minutes < v_sched.close_min THEN
        v_day := v_day - 1;
        SELECT * INTO v_sched FROM public.merchant_schedule_for_date(p_op_hours, v_day);

        IF v_sched.opens IS NOT TRUE
           OR v_sched.close_min > v_sched.open_min
           OR v_minutes >= v_sched.close_min THEN
            RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
            RETURN;
        END IF;
    END IF;

    IF v_sched.opens IS NOT TRUE THEN
        RETURN QUERY SELECT FALSE, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ;
        RETURN;
    END IF;

    v_open_ts := (v_day::TIMESTAMP + make_interval(mins => v_sched.open_min)) AT TIME ZONE v_tz;

    IF v_sched.close_min <= v_sched.open_min THEN
        v_close_ts := ((v_day + 1)::TIMESTAMP + make_interval(mins => v_sched.close_min)) AT TIME ZONE v_tz;
    ELSE
        v_close_ts := (v_day::TIMESTAMP + make_interval(mins => v_sched.close_min)) AT TIME ZONE v_tz;
    END IF;

    RETURN QUERY SELECT
        public.merchant_schedule_open(p_op_hours, v_tz, p_at),
        v_open_ts,
        v_close_ts,
        v_close_ts - make_interval(mins => v_buffer);
END;
$$;

-- Next moment the stall opens its doors (NULL when nothing in the next 14 days).
CREATE OR REPLACE FUNCTION public.merchant_next_open_at(
    p_op_hours JSONB,
    p_timezone TEXT,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_tz        TEXT := COALESCE(NULLIF(btrim(p_timezone), ''), 'Asia/Kuching');
    v_base_date DATE := (p_at AT TIME ZONE v_tz)::DATE;
    v_offset    INT;
    v_sched     RECORD;
    v_candidate TIMESTAMPTZ;
BEGIN
    FOR v_offset IN 0..14 LOOP
        SELECT * INTO v_sched
        FROM public.merchant_schedule_for_date(p_op_hours, v_base_date + v_offset);

        IF v_sched.opens IS TRUE THEN
            v_candidate := ((v_base_date + v_offset)::TIMESTAMP
                            + make_interval(mins => v_sched.open_min)) AT TIME ZONE v_tz;
            IF v_candidate > p_at THEN
                RETURN v_candidate;
            END IF;
        END IF;
    END LOOP;

    RETURN NULL;
END;
$$;

-- 3. Merchant-level availability -------------------------------------------------

-- Rich, derived availability payload (authoritative gating + UI messaging).
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
    SELECT id, business_name, is_open, is_accepting_orders, operating_hours, timezone, order_buffer_time
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

-- Canonical boolean gate: the single rule used by checkout and every client.
CREATE OR REPLACE FUNCTION public.is_merchant_accepting_now(
    p_merchant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        (public.merchant_availability_status(p_merchant_id, p_at) ->> 'is_currently_open')::BOOLEAN,
        FALSE
    );
$$;

-- 4. Derived availability view ---------------------------------------------------
-- NOTE: security_invoker requires PostgreSQL 15+ (Supabase default).

CREATE OR REPLACE VIEW public.merchant_availability
WITH (security_invoker = true)
AS
SELECT
    m.id,
    m.business_name,
    m.slug,
    m.timezone,
    m.is_open                    AS is_open_flag,
    m.is_accepting_orders,
    m.schedule_enforced,
    m.operating_hours,
    m.order_buffer_time,
    b.schedule_open,
    (m.is_open
        AND m.is_accepting_orders
        AND (NOT m.schedule_enforced
             OR (b.schedule_open
                 AND (b.last_order_at IS NULL OR now() <= b.last_order_at)))) AS is_currently_open,
    b.opens_at,
    b.closes_at,
    b.last_order_at,
    public.merchant_next_open_at(m.operating_hours, m.timezone, now()) AS next_open_at,
    now()                        AS evaluated_at
FROM public.merchants m
CROSS JOIN LATERAL public.merchant_window_bounds(
    m.operating_hours,
    m.timezone,
    m.order_buffer_time,
    now()
) AS b;

-- 5. Grants ----------------------------------------------------------------------

GRANT SELECT ON public.merchant_availability TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.hhmm_to_minutes(TEXT, INT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_schedule_for_date(JSONB, DATE) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_schedule_open(JSONB, TEXT, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_window_bounds(JSONB, TEXT, INT, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_next_open_at(JSONB, TEXT, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.merchant_availability_status(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_merchant_accepting_now(UUID, TIMESTAMPTZ) TO anon, authenticated, service_role;

-- Refresh the PostgREST schema cache so the new view/RPCs are queryable immediately.
NOTIFY pgrst, 'reload schema';
