-- Migration: Add has_tapaulinkpro to merchants table
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS has_tapaulinkpro BOOLEAN DEFAULT false;
