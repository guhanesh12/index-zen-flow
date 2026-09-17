DROP POLICY "Admins can update campaigns" ON public.email_campaigns;
CREATE POLICY "Admins can update campaigns" ON public.email_campaigns
FOR UPDATE TO authenticated
USING (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'communication', 'edit'))
WITH CHECK (is_super_admin(auth.uid()) OR has_permission(auth.uid(), 'communication', 'edit'));