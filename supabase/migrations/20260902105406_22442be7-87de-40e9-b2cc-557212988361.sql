INSERT INTO public.user_roles (user_id, role)
SELECT ap.user_id, 'admin'::app_role
FROM public.admin_profiles ap
WHERE ap.status = 'active'
ON CONFLICT (user_id, role) DO NOTHING;