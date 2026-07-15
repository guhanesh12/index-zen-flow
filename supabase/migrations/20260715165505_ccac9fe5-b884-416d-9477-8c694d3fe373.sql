-- Revoke public EXECUTE on sensitive SECURITY DEFINER functions.
-- These functions are used internally (by triggers, RLS policies via has_role/has_permission,
-- or by service-role edge functions) and must not be callable by anon or authenticated clients.
REVOKE EXECUTE ON FUNCTION public.encrypt_broker_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_broker_secret(bytea) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_broker_encryption_key() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_signup_bonuses() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_push_event(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_backend_engine() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_login_locked(text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin_hotkey_available(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referral_code_exists(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_valid_referral_code(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_account_active(uuid) FROM PUBLIC, anon;