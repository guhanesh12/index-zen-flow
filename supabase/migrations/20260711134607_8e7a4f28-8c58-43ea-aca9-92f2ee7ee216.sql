
-- 1) Revoke default PUBLIC execute on all SECURITY DEFINER functions in public
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 2) Re-grant only what the app legitimately needs.

-- has_role: used inside RLS policies executed as the calling user.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- Referral code checks: called during signup (anonymous) and from signed-in flows.
GRANT EXECUTE ON FUNCTION public.is_valid_referral_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.referral_code_exists(text) TO anon, authenticated;

-- Account/login status checks used by auth flows.
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_login_locked(text, text) TO anon, authenticated;
