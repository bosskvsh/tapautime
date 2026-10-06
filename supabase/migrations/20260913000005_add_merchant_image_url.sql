-- Migration: 20260913000005_add_merchant_image_url.sql
-- Description:
--   1. Adds image_url column to public.merchants table for stall storefront covers/banners.
--   2. Ensures storage.objects policies allow update and delete operations on merchant-documents.

-- 1. Add image_url to merchants table
ALTER TABLE public.merchants 
ADD COLUMN IF NOT EXISTS image_url TEXT;

-- 2. Add storage update & delete policies on merchant-documents bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow public update on merchant-documents'
  ) THEN
    CREATE POLICY "Allow public update on merchant-documents"
    ON storage.objects
    FOR UPDATE
    TO anon, authenticated
    USING (bucket_id = 'merchant-documents')
    WITH CHECK (bucket_id = 'merchant-documents');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow public delete on merchant-documents'
  ) THEN
    CREATE POLICY "Allow public delete on merchant-documents"
    ON storage.objects
    FOR DELETE
    TO anon, authenticated
    USING (bucket_id = 'merchant-documents');
  END IF;
END $$;
