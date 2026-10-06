-- Migration: 20260924000002_create_merchant_assets_bucket.sql
-- Description:
--   1. Creates the 'merchant-assets' public storage bucket used by merchant Store
--      Settings for banner uploads (banners/{merchant_id}/banner.*) and profile
--      photo uploads (profiles/{merchant_id}/profile.*).
--   2. Recreates the 'merchant-documents' public bucket (menu photos, onboarding
--      documents) declared in 20260912000003: that migration is recorded as
--      applied in remote history, but the bucket row is missing on the live
--      project (Storage API returns 404 NoSuchBucket for both bucket names).
--   3. Ensures storage.objects policies for both buckets exist, following the
--      merchant-documents pattern. Writes to merchant-assets are restricted to
--      authenticated merchants (uploads only happen from the logged-in Store
--      Settings screen); images are publicly readable so the customer PWA
--      merchant list and menu cover can render them.

-- 1. merchant-assets bucket (public: StoreSettingsScreen uses getPublicUrl)
INSERT INTO storage.buckets (id, name, public)
VALUES ('merchant-assets', 'merchant-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. merchant-documents bucket (public: MenuManagerScreen/OnboardingScreen use getPublicUrl)
INSERT INTO storage.buckets (id, name, public)
VALUES ('merchant-documents', 'merchant-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 3. merchant-documents policies (same as 20260912000003 + 20260913000005, idempotent)
DROP POLICY IF EXISTS "Allow public uploads to merchant-documents" ON storage.objects;
CREATE POLICY "Allow public uploads to merchant-documents"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'merchant-documents');

DROP POLICY IF EXISTS "Allow public read from merchant-documents" ON storage.objects;
CREATE POLICY "Allow public read from merchant-documents"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'merchant-documents');

DROP POLICY IF EXISTS "Allow public update on merchant-documents" ON storage.objects;
CREATE POLICY "Allow public update on merchant-documents"
ON storage.objects
FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'merchant-documents')
WITH CHECK (bucket_id = 'merchant-documents');

DROP POLICY IF EXISTS "Allow public delete on merchant-documents" ON storage.objects;
CREATE POLICY "Allow public delete on merchant-documents"
ON storage.objects
FOR DELETE
TO anon, authenticated
USING (bucket_id = 'merchant-documents');

-- 4. merchant-assets INSERT: authenticated merchants only
--    (no anonymous uploads for this bucket)
DROP POLICY IF EXISTS "Allow uploads to merchant-assets" ON storage.objects;
CREATE POLICY "Allow uploads to merchant-assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'merchant-assets');

-- 5. merchant-assets UPDATE: required because uploads use { upsert: true } on a fixed path
DROP POLICY IF EXISTS "Allow update on merchant-assets" ON storage.objects;
CREATE POLICY "Allow update on merchant-assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'merchant-assets')
WITH CHECK (bucket_id = 'merchant-assets');

-- 6. merchant-assets DELETE: allows replacing/removing images later
DROP POLICY IF EXISTS "Allow delete on merchant-assets" ON storage.objects;
CREATE POLICY "Allow delete on merchant-assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'merchant-assets');

-- 7. merchant-assets SELECT: public read so customers can see banners/profile photos
DROP POLICY IF EXISTS "Allow public read from merchant-assets" ON storage.objects;
CREATE POLICY "Allow public read from merchant-assets"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'merchant-assets');

