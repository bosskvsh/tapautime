-- =============================================================================
-- Fix: Allow authenticated customers to INSERT into order_events for their own orders
-- Root cause: No INSERT RLS policy existed → customer "I'm Here" arrival events
-- were silently blocked, preventing merchant notification.
-- =============================================================================

-- Allow customers to insert order_events for orders that belong to them.
-- Customers can only insert events where the order's customer_id matches their auth.uid().
DROP POLICY IF EXISTS "Customers insert own order events" ON public.order_events;
CREATE POLICY "Customers insert own order events"
  ON public.order_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_events.order_id
        AND o.customer_id = (SELECT auth.uid())
    )
  );

-- Ensure REPLICA IDENTITY FULL is set so Supabase Realtime can broadcast
-- column-level data (including event_type) on INSERT events.
ALTER TABLE public.order_events REPLICA IDENTITY FULL;

-- Ensure order_events is in the realtime publication (idempotent guard).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'order_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_events;
  END IF;
END $$;
