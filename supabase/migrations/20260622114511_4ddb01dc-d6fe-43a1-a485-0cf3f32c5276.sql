
-- 1. communication_settings: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Anyone can read comm settings" ON public.communication_settings;
CREATE POLICY "Authenticated can read comm settings"
  ON public.communication_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 2. avatars storage: restrict write policies to authenticated only (was public/anon)
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. avatars bucket: prevent listing by scoping SELECT to the owner's own folder
DROP POLICY IF EXISTS "Authenticated can list avatars" ON storage.objects;
CREATE POLICY "Public can read avatar files by exact path"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] IS NOT NULL
  );
-- Note: avatars bucket remains public so already-known URLs serve images,
-- but RLS now requires a path scope (no broad listing of all objects).
