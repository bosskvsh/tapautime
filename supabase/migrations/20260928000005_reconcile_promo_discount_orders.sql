-- Migration: 20260928000001_reconcile_promo_discount_orders.sql
-- Description: Reconciles historical orders where promo discount was not propagated
--              to sub-orders, ensuring total_amount, merchant_cut, and ledger_entries
--              accurately reflect net payout after promo code deductions.

DO $$
BEGIN
    -- Reconcile order #A60A-1
    UPDATE public.orders
    SET total_amount = 1.00,
        merchant_cut = 1.00,
        discount_amount = 13.73
    WHERE id = '1e714a1b-9cfd-423c-872f-3be445bb4d9f'
      AND promo_code = 'TAPAU1RINGGIT'
      AND merchant_cut > 1.00;

    -- Reconcile master transaction
    UPDATE public.master_transactions
    SET merchant_cut = 1.00
    WHERE id = 'a60a72ce-8964-4850-a86c-9a0942e83c10'
      AND promo_code = 'TAPAU1RINGGIT'
      AND merchant_cut > 1.00;

    -- Reconcile order #444F-1
    UPDATE public.orders
    SET total_amount = 1.00,
        merchant_cut = 1.00,
        discount_amount = 14.75
    WHERE id = 'f3230e63-2eb7-439a-8e61-4f389edd36df'
      AND promo_code = 'TAPAU1RINGGIT'
      AND merchant_cut > 1.00;

    -- Reconcile ledger entries under admin cleanup context
    PERFORM set_config('tapautime.allow_admin_cleanup', 'true', true);

    DELETE FROM public.ledger_entries
    WHERE order_id = '1e714a1b-9cfd-423c-872f-3be445bb4d9f'
      AND amount > 1.00;

    IF NOT EXISTS (
        SELECT 1 FROM public.ledger_entries 
        WHERE order_id = '1e714a1b-9cfd-423c-872f-3be445bb4d9f'
    ) THEN
        INSERT INTO public.ledger_entries (
            transaction_id,
            order_id,
            merchant_id,
            type,
            amount,
            description
        ) VALUES 
        (
            'a60a72ce-8964-4850-a86c-9a0942e83c10',
            '1e714a1b-9cfd-423c-872f-3be445bb4d9f',
            '551150fe-ca68-4254-9e2a-3c4a8aedadea',
            'credit',
            1.0000,
            'Net merchant payout for order ##A60A-1 (Promo: TAPAU1RINGGIT)'
        ),
        (
            'a60a72ce-8964-4850-a86c-9a0942e83c10',
            '1e714a1b-9cfd-423c-872f-3be445bb4d9f',
            '551150fe-ca68-4254-9e2a-3c4a8aedadea',
            'debit',
            0.0000,
            'Platform commission for order ##A60A-1'
        );
    END IF;
END $$;
