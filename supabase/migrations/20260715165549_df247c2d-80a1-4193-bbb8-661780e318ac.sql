REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.referral_code_exists(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_account_active(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_valid_referral_code(text) FROM authenticated;