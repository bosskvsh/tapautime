-- =============================================================================
-- Migration: 20260912000003_merchant_applications.sql
-- Description:
--   1. Creates public.merchant_applications table to store pending stall applications.
--   2. Enables Row Level Security with anonymous INSERT access.
--   3. Initializes 'merchant-documents' public Supabase Storage bucket with
--      anonymous file upload and public read policies for menu attachments.
-- =============================================================================

-- 1. Create merchant applications table
CREATE TABLE IF NOT EXISTS public.merchant_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    mykad_number TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    email TEXT NOT NULL,
    bank_name TEXT NOT NULL,
    bank_account_number TEXT NOT NULL,
    menu_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Enable RLS on merchant_applications
ALTER TABLE public.merchant_applications ENABLE ROW LEVEL SECURITY;

-- Allow anonymous & authenticated prospective merchants to insert application
DROP POLICY IF EXISTS "Allow public insert on merchant_applications" ON public.merchant_applications;
CREATE POLICY "Allow public insert on merchant_applications"
ON public.merchant_applications
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- Allow service_role to manage all applications
DROP POLICY IF EXISTS "Allow service_role full management on merchant_applications" ON public.merchant_applications;
CREATE POLICY "Allow service_role full management on merchant_applications"
ON public.merchant_applications
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Storage Bucket for merchant documents (menu copies, SSM certificates)
INSERT INTO storage.buckets (id, name, public)
VALUES ('merchant-documents', 'merchant-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy allowing public/anon uploads to merchant-documents bucket
DROP POLICY IF EXISTS "Allow public uploads to merchant-documents" ON storage.objects;
CREATE POLICY "Allow public uploads to merchant-documents"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'merchant-documents');

-- Policy allowing public read from merchant-documents bucket
DROP POLICY IF EXISTS "Allow public read from merchant-documents" ON storage.objects;
CREATE POLICY "Allow public read from merchant-documents"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'merchant-documents');
