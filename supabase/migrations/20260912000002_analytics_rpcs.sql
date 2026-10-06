-- =============================================================================
-- Migration: 20260912000002_analytics_rpcs.sql
-- Description:
--   Creates Supabase RPC functions to support the Merchant Operations & Sales
--   Analytics Dashboard:
--   1. get_merchant_sales_metrics: aggregates sales (sum of merchant_cut) and
--      order counts truncated by period ('day', 'week', 'month').
--   2. get_merchant_customer_metrics: groups orders by customer_id to classify
--      and count 'new' (1 lifetime order) vs 'regular' (>1 lifetime orders)
--      who purchased within the given date window.
--   3. Adds composite index on orders(merchant_id, payment_status, created_at)
--      for optimal analytics query performance.
-- =============================================================================

-- 1. Index optimization for merchant analytics queries
CREATE INDEX IF NOT EXISTS idx_orders_merchant_analytics 
ON public.orders(merchant_id, payment_status, created_at);

-- 2. Sales Metrics RPC
CREATE OR REPLACE FUNCTION public.get_merchant_sales_metrics(
    p_merchant_id UUID,
    p_start_date TIMESTAMPTZ,
    p_interval TEXT DEFAULT 'day'
)
RETURNS TABLE (
    period_start TIMESTAMPTZ,
    total_sales NUMERIC,
    order_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clean_interval TEXT;
BEGIN
    -- Defensive interval validation
    v_clean_interval := LOWER(TRIM(COALESCE(p_interval, 'day')));
    IF v_clean_interval NOT IN ('day', 'week', 'month') THEN
        RAISE EXCEPTION 'Invalid interval: %. Expected day, week, or month.', p_interval;
    END IF;

    RETURN QUERY
    SELECT 
        date_trunc(v_clean_interval, o.created_at) AS period_start,
        COALESCE(SUM(o.merchant_cut), 0.00)::NUMERIC(10, 2) AS total_sales,
        COUNT(*)::BIGINT AS order_count
    FROM public.orders o
    WHERE o.merchant_id::text = p_merchant_id::text
      AND o.payment_status::text = 'captured'
      AND (p_start_date IS NULL OR o.created_at >= p_start_date)
    GROUP BY date_trunc(v_clean_interval, o.created_at)
    ORDER BY period_start ASC;
END;
$$;

-- 3. Customer Retention Metrics RPC
CREATE OR REPLACE FUNCTION public.get_merchant_customer_metrics(
    p_merchant_id UUID,
    p_start_date TIMESTAMPTZ
)
RETURNS TABLE (
    new_customers BIGINT,
    regular_customers BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH customer_orders AS (
        -- Aggregates orders per customer for this specific merchant
        SELECT 
            o.customer_id,
            COUNT(*)::BIGINT AS lifetime_orders,
            COUNT(*) FILTER (WHERE (p_start_date IS NULL OR o.created_at >= p_start_date))::BIGINT AS orders_in_period
        FROM public.orders o
        WHERE o.merchant_id::text = p_merchant_id::text
          AND o.payment_status::text = 'captured'
          AND o.customer_id IS NOT NULL
        GROUP BY o.customer_id
    )
    SELECT
        COALESCE(COUNT(*) FILTER (WHERE c.lifetime_orders = 1 AND c.orders_in_period > 0), 0)::BIGINT AS new_customers,
        COALESCE(COUNT(*) FILTER (WHERE c.lifetime_orders > 1 AND c.orders_in_period > 0), 0)::BIGINT AS regular_customers
    FROM customer_orders c;
END;
$$;

-- 4. Permissions Lockdown (Accessible by authenticated merchants and service_role; revoked from anon/public)
REVOKE ALL ON FUNCTION public.get_merchant_sales_metrics(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_merchant_sales_metrics(UUID, TIMESTAMPTZ, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_merchant_sales_metrics(UUID, TIMESTAMPTZ, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_merchant_customer_metrics(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_merchant_customer_metrics(UUID, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_merchant_customer_metrics(UUID, TIMESTAMPTZ) TO authenticated, service_role;
