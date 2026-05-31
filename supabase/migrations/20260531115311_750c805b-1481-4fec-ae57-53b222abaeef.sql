-- =========================================================
-- PHASE 1: BANK-LEVEL SECURITY HARDENING — DATABASE LAYER
-- =========================================================

-- 1. FIX BROKEN {public} POLICIES (CRITICAL)
DROP POLICY IF EXISTS "Service role full access email logs" ON public.email_logs;
CREATE POLICY "Service role full access email logs"
  ON public.email_logs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access billing" ON public.notification_billing_log;
CREATE POLICY "Service role full access billing"
  ON public.notification_billing_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access prefs" ON public.notification_preferences;
CREATE POLICY "Service role full access prefs"
  ON public.notification_preferences FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access comm settings" ON public.communication_settings;
CREATE POLICY "Service role full access comm settings"
  ON public.communication_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages holidays" ON public.nse_holidays;
CREATE POLICY "Service role manages holidays"
  ON public.nse_holidays FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access referral_settings" ON public.referral_settings;
CREATE POLICY "Service role full access referral_settings"
  ON public.referral_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. REFERRAL CODES — stop leaking user_id UUIDs publicly
DROP POLICY IF EXISTS "Anyone can lookup referral codes" ON public.referral_codes;
CREATE POLICY "Authenticated can lookup referral codes"
  ON public.referral_codes FOR SELECT TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.referral_code_exists(_code text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.referral_codes WHERE upper(code) = upper(_code));
$$;
REVOKE ALL ON FUNCTION public.referral_code_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.referral_code_exists(text) TO anon, authenticated;

-- 3. REVOKE PUBLIC EXECUTE on internal/system functions
REVOKE EXECUTE ON FUNCTION public.generate_client_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_backend_engine() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('http','http_get','http_post','http_put','http_patch',
                        'http_delete','http_head','http_header','http_set_curlopt',
                        'http_reset_curlopt','http_list_curlopt','urlencode',
                        'text_to_bytea','bytea_to_text')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END $$;

-- 4. SECURITY AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  action text NOT NULL,
  resource text,
  resource_id text,
  ip_address text,
  user_agent text,
  status text NOT NULL DEFAULT 'success',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view all audit logs"
  ON public.security_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own audit logs"
  ON public.security_audit_log FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid());

CREATE POLICY "Service role full access audit log"
  ON public.security_audit_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON public.security_audit_log(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.security_audit_log(action, created_at DESC);

-- 5. FAILED LOGIN ATTEMPTS — brute-force lockout support
CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  ip_address text,
  user_agent text,
  attempt_type text NOT NULL DEFAULT 'user',
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.failed_login_attempts TO service_role;

ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view failed logins"
  ON public.failed_login_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access failed logins"
  ON public.failed_login_attempts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_failed_login_identifier ON public.failed_login_attempts(identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_failed_login_ip ON public.failed_login_attempts(ip_address, created_at DESC);

-- 6. Helper to check lockout (15min window, 5 attempts = locked)
CREATE OR REPLACE FUNCTION public.is_login_locked(_identifier text, _ip text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.failed_login_attempts
    WHERE created_at > now() - interval '15 minutes'
      AND (identifier = _identifier OR (_ip IS NOT NULL AND ip_address = _ip))
  ) >= 5;
$$;
REVOKE ALL ON FUNCTION public.is_login_locked(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_login_locked(text, text) TO anon, authenticated;