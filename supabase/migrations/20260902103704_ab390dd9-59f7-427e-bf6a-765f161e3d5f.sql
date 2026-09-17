CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  admin_name text,
  hotkey text,
  login_method text NOT NULL DEFAULT 'hotkey+email_otp+totp',
  ip_address text,
  user_agent text,
  device text,
  browser text,
  login_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  logout_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_sessions TO authenticated;
GRANT ALL ON public.admin_sessions TO service_role;

ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view admin sessions"
  ON public.admin_sessions FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.admin_profiles ap
      WHERE ap.user_id = auth.uid() AND ap.status = 'active'
    )
  );

CREATE TRIGGER trg_admin_sessions_updated
  BEFORE UPDATE ON public.admin_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_admin_sessions_login_at ON public.admin_sessions (login_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON public.admin_sessions (admin_user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_created ON public.admin_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_events_actor ON public.admin_audit_events (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_created ON public.admin_access_log (created_at DESC);