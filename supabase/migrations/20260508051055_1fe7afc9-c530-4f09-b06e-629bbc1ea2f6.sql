
ALTER FUNCTION public.generate_client_id() SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_client_id() FROM PUBLIC, anon, authenticated;
