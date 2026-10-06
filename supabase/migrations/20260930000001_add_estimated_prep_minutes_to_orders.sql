-- Migration: 20260930000001_add_estimated_prep_minutes_to_orders.sql
-- Description: Adds estimated_prep_minutes to orders table to allow merchants to extend prep time.

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS estimated_prep_minutes INTEGER NOT NULL DEFAULT 15;
