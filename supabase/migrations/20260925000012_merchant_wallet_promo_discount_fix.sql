-- Migration: 20260925000012_merchant_wallet_promo_discount_fix.sql
-- Description: Ensures handle_order_completed_ledger uses NEW.merchant_cut as the authoritative net payout
--              after subtracting promo code discounts, and updates ledger descriptions with promo code details.

CREATE OR REPLACE FUNCTION public.handle_order_completed_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_merchant_uuid UUID;
    v_platform_fee NUMERIC(12,4);
    v_merchant_net NUMERIC(12,4);
    v_order_total NUMERIC(12,4);
    v_is_completed BOOLEAN;
    v_promo_info TEXT;
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
        END;

        IF v_merchant_uuid IS NOT NULL THEN
            -- Idempotency check: prevent duplicate credit/debit insertion on KDS double-taps
            IF NOT EXISTS (SELECT 1 FROM public.ledger_entries WHERE order_id = NEW.id) THEN
                v_order_total := COALESCE(NEW.total_amount, 0)::NUMERIC(12,4);
                
                -- Authoritative Net Settlement:
                -- If NEW.merchant_cut is explicitly recorded on the order (e.g. from checkout calculation
                -- with promo code deductions), use it directly. Otherwise calculate 95% net default.
                IF NEW.merchant_cut IS NOT NULL AND NEW.merchant_cut >= 0 THEN
                    v_merchant_net := NEW.merchant_cut::NUMERIC(12,4);
                    v_platform_fee := GREATEST(0, v_order_total - v_merchant_net);
                ELSE
                    v_platform_fee := ROUND(v_order_total * 0.0500, 4);
                    v_merchant_net := ROUND(v_order_total - v_platform_fee, 4);
                END IF;

                v_promo_info := CASE 
                    WHEN NEW.promo_code IS NOT NULL AND LENGTH(TRIM(NEW.promo_code)) > 0 
                    THEN ' (Promo: ' || NEW.promo_code || ')' 
                    ELSE '' 
                END;

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
                    'Net merchant payout for order #' || COALESCE(NEW.display_id, SUBSTRING(NEW.id::text, 1, 8)) || v_promo_info
                );

                -- 2. Double-Entry: Debit Platform Fee
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
                    'Platform commission for order #' || COALESCE(NEW.display_id, SUBSTRING(NEW.id::text, 1, 8))
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

-- Re-grant execute / alter search path permissions
ALTER FUNCTION public.handle_order_completed_ledger() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.handle_order_completed_ledger() FROM public, anon, authenticated;
