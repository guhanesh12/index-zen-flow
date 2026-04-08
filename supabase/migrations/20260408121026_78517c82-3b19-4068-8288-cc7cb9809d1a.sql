
-- Add RLS policies to storage.objects for all private buckets
-- These policies allow authenticated users to manage their own files (path starts with their user ID)
-- Service role key (used by edge functions) bypasses RLS automatically

-- Bucket: make-c4d79cb7-employees
CREATE POLICY "owner_select_employees" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'make-c4d79cb7-employees' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_insert_employees" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'make-c4d79cb7-employees' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_update_employees" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'make-c4d79cb7-employees' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_delete_employees" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'make-c4d79cb7-employees' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Bucket: make-c4d79cb7-landing-images (public read, owner write)
CREATE POLICY "public_read_landing_images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'make-c4d79cb7-landing-images');
CREATE POLICY "owner_insert_landing_images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'make-c4d79cb7-landing-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_update_landing_images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'make-c4d79cb7-landing-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_delete_landing_images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'make-c4d79cb7-landing-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Bucket: make-c4d79cb7-notifications
CREATE POLICY "owner_select_notifications" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'make-c4d79cb7-notifications' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_insert_notifications" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'make-c4d79cb7-notifications' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_update_notifications" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'make-c4d79cb7-notifications' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_delete_notifications" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'make-c4d79cb7-notifications' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Bucket: make-e504ac8b-charts
CREATE POLICY "owner_select_charts" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'make-e504ac8b-charts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_insert_charts" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'make-e504ac8b-charts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_update_charts" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'make-e504ac8b-charts' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_delete_charts" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'make-e504ac8b-charts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Bucket: make-02ecea6e-files
CREATE POLICY "owner_select_files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'make-02ecea6e-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_insert_files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'make-02ecea6e-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_update_files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'make-02ecea6e-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "owner_delete_files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'make-02ecea6e-files' AND auth.uid()::text = (storage.foldername(name))[1]);
