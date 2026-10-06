-- =============================================================================
-- Migration: 20260904000003_order_completion_ledger_trigger.sql
-- Description: 
-- 1. Adds operating_hours JSONB to merchants
-- 2. Creates trigger to write double-entry fiat rows to ledger_entries upon order completion
-- 3. Increments customer successful_orders_count for trust scoring
-- =============================================================================

ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS operating_hours JSONB NOT NULL DEFAULT '{"open": "07:00", "close": "22:00", "days": [0,1,2,3,4,5,6]}'::jsonb;

CREATE OR REPLACE FUNCTION public.handle_order_completed_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_merchant_uuid UUID;
    v_platform_fee NUMERIC(12,4);
    v_merchant_net NUMERIC(12,4);
    v_order_total NUMERIC(12,4);
    v_is_completed BOOLEAN;
BEGIN
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
        BEGIN
            v_merchant_uuid := NEW.merchant_id::UUID;
        EXCEPTION WHEN OTHERS THEN
            SELECT id INTO v_merchant_uuid FROM public.merchants WHERE id::text = NEW.merchant_id;
        END IF;

        IF v_merchant_uuid IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE order_id = NEW.id) THEN
                v_order_total := COALESCE(NEW.total_amount, 0)::NUMERIC(12,4);
                
                v_platform_fee := ROUND(v_order_total * 0.0500, 4);
                v_merchant_net := ROUND(v_order_total - v_platform_fee, 4);

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

DROP TRIGGER IF EXISTS trg_order_completed_ledger ON public.orders;
CREATE TRIGGER trg_order_completed_ledger
    AFTER UPDATE OF order_status, status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_order_completed_ledger();
