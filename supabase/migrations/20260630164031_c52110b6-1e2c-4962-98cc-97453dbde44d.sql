DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Support files are backend managed only'
  ) THEN
    CREATE POLICY "Support files are backend managed only"
    ON storage.objects
    FOR ALL
    TO service_role
    USING (bucket_id = 'make-c4d79cb7-files')
    WITH CHECK (bucket_id = 'make-c4d79cb7-files');
  END IF;
END $$;