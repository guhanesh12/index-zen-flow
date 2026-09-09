DROP POLICY IF EXISTS "Authenticated can read comm settings" ON public.communication_settings;
CREATE POLICY "Admins can read comm settings"
ON public.communication_settings
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.admin_profiles ap
    WHERE ap.user_id = auth.uid() AND ap.status = 'active'
  )
);