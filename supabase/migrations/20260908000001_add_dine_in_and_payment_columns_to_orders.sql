-- =============================================================================
-- Migration: 20260908000001_add_dine_in_and_payment_columns_to_orders.sql
-- Description: Expand orders table to support dine-in flow and payment details.
-- =============================================================================

-- Step 1: Add columns IF NOT EXISTS (for fresh installations)
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS order_type TEXT NOT NULL DEFAULT 'takeaway',
    ADD COLUMN IF NOT EXISTS table_number TEXT,
    ADD COLUMN IF NOT EXISTS payment_method TEXT,
    ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'paid';

-- Step 2: Defensive Data Normalization for pre-existing records & types
DO $$
BEGIN
    -- Normalize legacy 'tapau' / 'dinein' to canonical 'takeaway' / 'dine_in'
    UPDATE public.orders
    SET order_type = CASE
        WHEN order_type IN ('dine_in', 'dinein') THEN 'dine_in'
        ELSE 'takeaway'
    END
    WHERE order_type IS NULL OR order_type NOT IN ('takeaway', 'dine_in');

    -- Normalize legacy payment methods
    UPDATE public.orders
    SET payment_method = CASE
        WHEN payment_method ILIKE '%cash%' THEN 'cash'
        WHEN payment_method IS NOT NULL THEN 'online'
        ELSE NULL
    END
    WHERE payment_method IS NOT NULL AND payment_method NOT IN ('online', 'cash');

    -- If payment_status was an ENUM type, convert column to TEXT safely
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'payment_status'
          AND data_type = 'USER-DEFINED'
    ) THEN
        ALTER TABLE public.orders ALTER COLUMN payment_status DROP DEFAULT;
        ALTER TABLE public.orders ALTER COLUMN payment_status TYPE TEXT USING payment_status::text;
    END IF;

    -- Normalize existing payment_status values to 'paid' or 'pending_cash'
    UPDATE public.orders
    SET payment_status = CASE
        WHEN payment_status IN ('paid', 'captured') THEN 'paid'
        ELSE 'pending_cash'
    END
    WHERE payment_status IS NULL OR payment_status NOT IN ('paid', 'pending_cash');

    -- Set correct default values
    ALTER TABLE public.orders ALTER COLUMN order_type SET DEFAULT 'takeaway';
    ALTER TABLE public.orders ALTER COLUMN payment_status SET DEFAULT 'paid';
    ALTER TABLE public.orders ALTER COLUMN payment_status SET NOT NULL;

    -- Drop old constraints if they exist
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_order_type_check;
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

    -- Add the strict CHECK constraints requested
    ALTER TABLE public.orders ADD CONSTRAINT orders_order_type_check CHECK (order_type IN ('takeaway', 'dine_in'));
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check CHECK (payment_method IS NULL OR payment_method IN ('online', 'cash'));
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check CHECK (payment_status IN ('paid', 'pending_cash'));
END $$;

-- Optional index for faster filtering by order_type
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON public.orders(order_type);
