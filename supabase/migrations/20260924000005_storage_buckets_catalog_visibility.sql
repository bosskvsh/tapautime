-- Migration: 20260924000005_storage_buckets_catalog_visibility.sql
-- Description:
--   1. Adds a SELECT policy on storage.buckets so bucket list/detail endpoints
--      (GET /storage/v1/bucket, GET /storage/v1/bucket/{id}) stop returning
--      [] / 404 NoSuchBucket for anon and authenticated callers. Root cause:
--      storage.buckets has RLS enabled with ZERO policies, so callers outside
--      the storage service's privileged connection could never read the catalog
--      even though the bucket rows existed. Scope is limited to public buckets
--      plus the caller's own owned buckets (private bucket names stay hidden).
--   2. Drops the one-time diagnostic/self-healing RPCs created during the
--      investigation (diag_storage_buckets, ensure_merchant_storage_buckets)
--      so storage internals are no longer exposed to anon. Future environments
--      get the buckets from migration 20260924000002.

-- 1. Bucket catalog visibility
DROP POLICY IF EXISTS "Public buckets and own buckets are visible" ON storage.buckets;
CREATE POLICY "Public buckets and own buckets are visible"
ON storage.buckets
FOR SELECT
TO anon, authenticated
USING (public = true OR owner_id = (SELECT auth.uid()::text));

-- 2. Remove one-time diagnostics
DROP FUNCTION IF EXISTS public.diag_storage_buckets();
DROP FUNCTION IF EXISTS public.ensure_merchant_storage_buckets();
