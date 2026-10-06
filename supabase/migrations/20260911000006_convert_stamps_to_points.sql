-- =============================================================================
-- Migration: 20260911000006_convert_stamps_to_points.sql
-- Description: Converts rewards architecture from stamps to 1:1 points system.
-- =============================================================================

-- 1. Clean up legacy stamp columns on public.users if present
ALTER TABLE public.users DROP COLUMN IF EXISTS stamp_count;
ALTER TABLE public.users DROP COLUMN IF EXISTS stamps;

-- 2. Add points_balance column to public.users
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0);

-- 3. Add points_earned column to public.orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS points_earned INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0);

-- 4. Create trigger to automatically award points when order payment is captured or paid
CREATE OR REPLACE FUNCTION public.handle_order_points_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only award when payment_status transitions to captured or paid from a non-captured/non-paid status
    IF (NEW.payment_status IN ('captured', 'paid'))
       AND (OLD.payment_status IS NULL OR OLD.payment_status NOT IN ('captured', 'paid'))
       AND (NEW.points_earned > 0)
       AND (NEW.customer_id IS NOT NULL) THEN

        UPDATE public.users
        SET points_balance = points_balance + NEW.points_earned,
            updated_at = now()
        WHERE id = NEW.customer_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_points_award ON public.orders;
CREATE TRIGGER trg_order_points_award
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_order_points_award();

-- Also handle direct INSERT with captured/paid status (e.g. cash completed or direct capture)
CREATE OR REPLACE FUNCTION public.handle_order_points_award_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (NEW.payment_status IN ('captured', 'paid'))
       AND (NEW.points_earned > 0)
       AND (NEW.customer_id IS NOT NULL) THEN

        UPDATE public.users
        SET points_balance = points_balance + NEW.points_earned,
            updated_at = now()
        WHERE id = NEW.customer_id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_points_award_insert ON public.orders;
CREATE TRIGGER trg_order_points_award_insert
    AFTER INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_order_points_award_insert();
