-- 1) Audit log spoofing: remove client-side INSERT ability
DROP POLICY IF EXISTS "Authenticated can insert audit events" ON public.admin_audit_events;
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_events FROM authenticated, anon;
GRANT SELECT ON public.admin_audit_events TO authenticated;
GRANT ALL ON public.admin_audit_events TO service_role;

-- 2) Avatar read policy: scope to <user-uuid>/<file> paths only
DROP POLICY IF EXISTS "Public can read avatar files by exact path" ON storage.objects;
CREATE POLICY "Public can read avatars under user folders"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'avatars'
  AND array_length(storage.foldername(name), 1) = 1
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND storage.filename(name) ~* '\.(png|jpe?g|webp|gif|avif)$'
);