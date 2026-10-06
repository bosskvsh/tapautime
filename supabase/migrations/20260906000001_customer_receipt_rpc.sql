-- =============================================================================
-- Migration: 20260906000001_customer_receipt_rpc.sql
-- Description:
-- 1. Defensively ensures display_id and updated_at exist on public.orders.
-- 2. Reinforces idempotency IF NOT EXISTS check in handle_order_completed_ledger()
--    preserving merchant UUID resolution, double-entry rows (95% net, 5% fee),
--    and customer successful_orders_count trust-scoring increment.
-- 3. Creates SECURITY DEFINER RPC public.get_customer_receipt(p_order_id UUID)
--    validating customer ownership, checking ledger existence, and returning
--    a sanitized receipt strictly omitting merchant net payout and platform fee.
-- 4. Enforces authenticated-only execution (revoked from anon and PUBLIC).
-- =============================================================================

-- Step 1: Ensure helper columns exist on orders for clean receipts
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS display_id TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Step 2: Ensure handle_order_completed_ledger() has strict idempotency check
CREATE OR REPLACE FUNCTION public.handle_order_completed_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_merchant_uuid UUID;
    v_platform_fee NUMERIC(12,4);
    v_merchant_net NUMERIC(12,4);
    v_order_total NUMERIC(12,4);
    v_is_completed BOOLEAN;
BEGIN
    -- Check if status transitioned to completed (case-insensitive across both potential columns)
    v_is_completed := (
        (NEW.order_status IS NOT NULL AND LOWER(NEW.order_status::text) = 'completed')
        OR (NEW.status IS NOT NULL AND LOWER(NEW.status) = 'completed')
    );

    IF v_is_completed AND (
        OLD.order_status IS NULL 
        OR LOWER(OLD.order_status::text) != 'completed'
        OR OLD.status IS NULL
        OR LOWER(OLD.status) != 'completed'
    ) THEN
        -- Resolve merchant UUID safely (handles both raw UUID and string identifiers)
        BEGIN
            v_merchant_uuid := NEW.merchant_id::UUID;
        EXCEPTION WHEN OTHERS THEN
            SELECT id INTO v_merchant_uuid FROM public.merchants WHERE id::text = NEW.merchant_id;
        END IF;

        IF v_merchant_uuid IS NOT NULL THEN
            -- Idempotency check: prevent duplicate credit/debit insertion on KDS double-taps
            IF NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE order_id = NEW.id) THEN
                v_order_total := COALESCE(NEW.total_amount, 0)::NUMERIC(12,4);
                
                -- Standard Platform Commission (5.0000%) & Merchant Net Settlement (95.0000%)
                v_platform_fee := ROUND(v_order_total * 0.0500, 4);
                v_merchant_net := ROUND(v_order_total - v_platform_fee, 4);

                -- 1. Double-Entry: Credit Merchant Net Payout
                INSERT INTO public.ledger_entries (
                    transaction_id,
                    order_id,
                    merchant_id,
                    type,
                    amount,
                    description
                ) VALUES (
                    NEW.transaction_id,
                    NEW.id,
                    v_merchant_uuid,
                    'credit',
                    v_merchant_net,
                    'Net merchant payout for order #' || COALESCE(NEW.display_id, SUBSTRING(NEW.id::text, 1, 8))
                );

                -- 2. Double-Entry: Debit Platform Fee (5%)
                INSERT INTO public.ledger_entries (
                    transaction_id,
                    order_id,
                    merchant_id,
                    type,
                    amount,
                    description
                ) VALUES (
                    NEW.transaction_id,
                    NEW.id,
                    v_merchant_uuid,
                    'debit',
                    v_platform_fee,
                    'Platform commission (5%) for order #' || COALESCE(NEW.display_id, SUBSTRING(NEW.id::text, 1, 8))
                );
            END IF;
        END IF;

        -- 3. Increment Customer Trust Tier Counter
        IF NEW.customer_id IS NOT NULL THEN
            UPDATE public.users
            SET 
                successful_orders_count = COALESCE(successful_orders_count, 0) + 1,
                updated_at = now()
            WHERE id = NEW.customer_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure trigger is active
DROP TRIGGER IF EXISTS trg_order_completed_ledger ON public.orders;
CREATE TRIGGER trg_order_completed_ledger
    AFTER UPDATE OF order_status, status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_order_completed_ledger();


-- Step 3: Create Customer Receipt SECURITY DEFINER RPC
CREATE OR REPLACE FUNCTION public.get_customer_receipt(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_receipt JSONB;
    v_has_ledger BOOLEAN;
BEGIN
    -- Strict customer ownership check: authenticated customer must own the order
    IF NOT EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = p_order_id 
          AND customer_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Unauthorized or order not found';
    END IF;

    -- Evaluate immutable ledger entry existence to verify settlement proof
    SELECT EXISTS (
        SELECT 1 FROM public.ledger_entries 
        WHERE order_id = p_order_id
    ) INTO v_has_ledger;

    -- Assemble sanitized receipt (strictly omitting merchant net and platform commission)
    SELECT jsonb_build_object(
        'order_id', o.id,
        'display_id', COALESCE(o.display_id, SUBSTRING(o.id::text, 1, 8)),
        'total_amount', o.total_amount,
        'pickup_pin', COALESCE(o.pickup_pin, mt.pickup_pin),
        'status', COALESCE(o.order_status::text, o.status),
        'payment_status', o.payment_status::text,
        'payment_method', COALESCE(mt.payment_method::text, 'gateway'),
        'created_at', o.created_at,
        'completed_at', COALESCE(o.updated_at, o.created_at),
        'ledger_verified', v_has_ledger
    ) INTO v_receipt
    FROM public.orders o
    LEFT JOIN public.master_transactions mt ON mt.id = o.transaction_id
    WHERE o.id = p_order_id;

    RETURN v_receipt;
END;
$$;

-- Step 4: Strict permission lockdown (Authenticated ONLY, revoked from anon and PUBLIC)
REVOKE ALL ON FUNCTION public.get_customer_receipt(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_customer_receipt(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_receipt(UUID) TO authenticated;
