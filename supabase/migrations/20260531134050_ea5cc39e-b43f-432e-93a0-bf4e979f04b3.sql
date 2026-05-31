
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1) admin_security_config
CREATE TABLE IF NOT EXISTS public.admin_security_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ip_allowlist_enabled boolean NOT NULL DEFAULT false,
  geo_restrict_enabled boolean NOT NULL DEFAULT false,
  allowed_countries text[] NOT NULL DEFAULT ARRAY['IN'],
  alert_email text,
  alert_on_auto_suspend boolean NOT NULL DEFAULT true,
  alert_on_critical_event boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT, INSERT, UPDATE ON public.admin_security_config TO authenticated;
GRANT ALL ON public.admin_security_config TO service_role;
ALTER TABLE public.admin_security_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage security config" ON public.admin_security_config FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Service role full access security config" ON public.admin_security_config FOR ALL TO service_role
  USING (true) WITH CHECK (true);
INSERT INTO public.admin_security_config (id, alert_email) VALUES (1,'guhanesh.v@smilykart.com')
ON CONFLICT (id) DO UPDATE SET alert_email = COALESCE(public.admin_security_config.alert_email, EXCLUDED.alert_email);

-- 2) admin_ip_allowlist
CREATE TABLE IF NOT EXISTS public.admin_ip_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  label text,
  added_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_ip_allowlist_ip_idx ON public.admin_ip_allowlist (ip_address);
GRANT SELECT, INSERT, DELETE ON public.admin_ip_allowlist TO authenticated;
GRANT ALL ON public.admin_ip_allowlist TO service_role;
ALTER TABLE public.admin_ip_allowlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ip allowlist" ON public.admin_ip_allowlist FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Service role full access ip allowlist" ON public.admin_ip_allowlist FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 3) admin_access_log
CREATE TABLE IF NOT EXISTS public.admin_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, email text, ip_address text, country_code text, user_agent text,
  allowed boolean NOT NULL, reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_access_log TO authenticated;
GRANT ALL ON public.admin_access_log TO service_role;
ALTER TABLE public.admin_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view admin access log" ON public.admin_access_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Service role full access admin access log" ON public.admin_access_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 4) Broker credential encryption
ALTER TABLE public.broker_credentials
  ADD COLUMN IF NOT EXISTS access_token_encrypted bytea,
  ADD COLUMN IF NOT EXISTS api_secret_encrypted bytea,
  ADD COLUMN IF NOT EXISTS encrypted_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_broker_encryption_key()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE k text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO k FROM vault.decrypted_secrets WHERE name = 'broker_encryption_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN k := NULL;
  END;
  IF k IS NULL OR length(k) = 0 THEN
    k := encode(extensions.digest('indexpilot-broker-enc-v1-static-seed-2026', 'sha256'), 'hex');
  END IF;
  RETURN k;
END; $$;
REVOKE EXECUTE ON FUNCTION public.get_broker_encryption_key() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_broker_encryption_key() TO service_role;

CREATE OR REPLACE FUNCTION public.encrypt_broker_secret(_plaintext text)
RETURNS bytea LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE k text := public.get_broker_encryption_key();
BEGIN
  IF _plaintext IS NULL OR _plaintext = '' THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_encrypt(_plaintext, k);
END; $$;

CREATE OR REPLACE FUNCTION public.decrypt_broker_secret(_ciphertext bytea)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE k text := public.get_broker_encryption_key();
BEGIN
  IF _ciphertext IS NULL THEN RETURN NULL; END IF;
  RETURN extensions.pgp_sym_decrypt(_ciphertext, k);
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END; $$;
REVOKE EXECUTE ON FUNCTION public.encrypt_broker_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_broker_secret(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_broker_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.decrypt_broker_secret(bytea) TO service_role;

CREATE OR REPLACE FUNCTION public.broker_credentials_auto_encrypt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token <> '' THEN
    NEW.access_token_encrypted := public.encrypt_broker_secret(NEW.access_token);
    NEW.encrypted_at := now();
  END IF;
  IF NEW.api_secret IS NOT NULL AND NEW.api_secret <> '' THEN
    NEW.api_secret_encrypted := public.encrypt_broker_secret(NEW.api_secret);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_broker_credentials_auto_encrypt ON public.broker_credentials;
CREATE TRIGGER trg_broker_credentials_auto_encrypt
  BEFORE INSERT OR UPDATE OF access_token, api_secret ON public.broker_credentials
  FOR EACH ROW EXECUTE FUNCTION public.broker_credentials_auto_encrypt();

UPDATE public.broker_credentials
SET access_token_encrypted = public.encrypt_broker_secret(access_token),
    api_secret_encrypted = public.encrypt_broker_secret(api_secret),
    encrypted_at = now()
WHERE (access_token IS NOT NULL OR api_secret IS NOT NULL)
  AND access_token_encrypted IS NULL;

-- 5) Updated auto-suspend trigger w/ email alert via pg_net
CREATE OR REPLACE FUNCTION public.auto_suspend_on_brute_force()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fail_count int;
  target_user uuid;
  alert_to text;
  alert_enabled boolean;
  fn_url text := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/send-security-alert';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0';
BEGIN
  SELECT COUNT(*) INTO fail_count FROM public.failed_login_attempts
  WHERE identifier = NEW.identifier AND created_at > now() - interval '15 minutes';

  IF fail_count >= 10 THEN
    SELECT user_id INTO target_user FROM public.profiles WHERE email = NEW.identifier LIMIT 1;
    IF target_user IS NOT NULL THEN
      INSERT INTO public.suspended_users (user_id, reason, rule_triggered, auto, metadata)
      VALUES (target_user, 'Auto-suspended: 10+ failed login attempts in 15 minutes', 'brute_force', true,
              jsonb_build_object('identifier', NEW.identifier, 'ip', NEW.ip_address, 'count', fail_count))
      ON CONFLICT (user_id) DO NOTHING;

      INSERT INTO public.security_audit_log (actor_user_id, action, resource, status, metadata)
      VALUES (target_user, 'auto_suspend', 'account', 'critical',
              jsonb_build_object('rule', 'brute_force', 'count', fail_count));

      SELECT alert_email, alert_on_auto_suspend INTO alert_to, alert_enabled
        FROM public.admin_security_config WHERE id = 1;

      IF alert_enabled AND alert_to IS NOT NULL THEN
        BEGIN
          PERFORM net.http_post(
            url := fn_url,
            headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||anon_key),
            body := jsonb_build_object(
              'to', alert_to,
              'subject', '[IndexPilot Security] Account auto-suspended',
              'event', 'auto_suspend',
              'severity', 'critical',
              'details', jsonb_build_object(
                'user_id', target_user, 'email', NEW.identifier,
                'ip', NEW.ip_address, 'failed_attempts', fail_count,
                'window', '15 minutes', 'time', now()
              )
            )
          );
        EXCEPTION WHEN OTHERS THEN NULL; END;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END; $$;
