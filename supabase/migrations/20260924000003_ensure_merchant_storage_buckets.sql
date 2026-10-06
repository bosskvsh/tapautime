-- Migration: 20260924000003_ensure_merchant_storage_buckets.sql
-- Description:
--   Diagnostic + self-healing helper for the storage buckets created by
--   20260924000002. The migration reports as applied, yet the Storage API kept
--   returning 404 NoSuchBucket, so this SECURITY DEFINER function (fixed body,
--   no parameters - safe for anon) re-asserts the two bucket rows and returns
--   the actual contents of storage.buckets so the REST response can confirm
--   whether the rows exist in the database.

CREATE OR REPLACE FUNCTION public.ensure_merchant_storage_buckets()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES
        ('merchant-assets', 'merchant-assets', true),
        ('merchant-documents', 'merchant-documents', true)
    ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

    RETURN jsonb_build_object(
        'bucket_count', (SELECT count(*) FROM storage.buckets),
        'bucket_ids', (SELECT COALESCE(jsonb_agg(id ORDER BY id), '[]'::jsonb) FROM storage.buckets)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_merchant_storage_buckets() TO anon, authenticated, service_role;
