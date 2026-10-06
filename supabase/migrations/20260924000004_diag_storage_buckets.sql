-- Migration: 20260924000004_diag_storage_buckets.sql
-- Description:
--   Read-only diagnostic for the "Bucket not found" issue: bucket rows are
--   confirmed present (ensure_merchant_storage_buckets returns count=2) yet the
--   Storage API keeps returning 404 NoSuchBucket. Returns RLS state, policies,
--   table owner, and full row contents of storage.buckets so we can tell whether
--   the storage service is blocked by RLS or by its own cache.

CREATE OR REPLACE FUNCTION public.diag_storage_buckets()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
    SELECT jsonb_build_object(
        'database', current_database(),
        'buckets_rls_enabled', (SELECT relrowsecurity FROM pg_class WHERE oid = 'storage.buckets'::regclass),
        'buckets_owner', (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'storage.buckets'::regclass),
        'current_role', current_user,
        'policies', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'name', policyname, 'cmd', cmd, 'roles', roles, 'qual', qual
            ) ORDER BY policyname), '[]'::jsonb)
            FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'buckets'
        ),
        'rows', (
            SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b.id), '[]'::jsonb)
            FROM storage.buckets b
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.diag_storage_buckets() TO anon, authenticated, service_role;
