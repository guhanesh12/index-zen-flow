
-- Suspended users table
CREATE TABLE public.suspended_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  reason text NOT NULL,
  rule_triggered text,
  auto boolean NOT NULL DEFAULT false,
  suspended_by uuid,
  suspended_at timestamptz NOT NULL DEFAULT now(),
  unsuspended_at timestamptz,
  unsuspended_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.suspended_users TO authenticated;
GRANT ALL ON public.suspended_users TO service_role;

ALTER TABLE public.suspended_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own suspension"
  ON public.suspended_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins manage suspensions"
  ON public.suspended_users FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access suspended_users"
  ON public.suspended_users FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Helper function: is account active
CREATE OR REPLACE FUNCTION public.is_account_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.suspended_users
    WHERE user_id = _user_id AND unsuspended_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO authenticated, service_role;

-- Auto-suspend trigger on failed_login_attempts
CREATE OR REPLACE FUNCTION public.auto_suspend_on_brute_force()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fail_count int;
  target_user uuid;
BEGIN
  SELECT COUNT(*) INTO fail_count
  FROM public.failed_login_attempts
  WHERE identifier = NEW.identifier
    AND created_at > now() - interval '15 minutes';

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
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_suspend ON public.failed_login_attempts;
CREATE TRIGGER trg_auto_suspend
AFTER INSERT ON public.failed_login_attempts
FOR EACH ROW EXECUTE FUNCTION public.auto_suspend_on_brute_force();

-- Block suspended users from sensitive tables (add restrictive policy)
CREATE POLICY "Suspended users blocked - trading_orders"
  ON public.trading_orders AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

CREATE POLICY "Suspended users blocked - trading_signals"
  ON public.trading_signals AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

CREATE POLICY "Suspended users blocked - user_symbols"
  ON public.user_symbols AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

CREATE POLICY "Suspended users blocked - user_symbol_config"
  ON public.user_symbol_config AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

CREATE POLICY "Suspended users blocked - position_monitor_state"
  ON public.position_monitor_state AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

CREATE POLICY "Suspended users blocked - trading_engine_state"
  ON public.trading_engine_state AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

CREATE POLICY "Suspended users blocked - broker_credentials"
  ON public.broker_credentials AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

CREATE POLICY "Suspended users blocked - wallet_transactions"
  ON public.wallet_transactions AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));

CREATE POLICY "Suspended users blocked - notification_preferences"
  ON public.notification_preferences AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.is_account_active(auth.uid()))
  WITH CHECK (public.is_account_active(auth.uid()));
