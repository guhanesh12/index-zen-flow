
-- Communication settings (single row, admin-controlled)
CREATE TABLE IF NOT EXISTS public.communication_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  from_email TEXT NOT NULL DEFAULT 'noreply@indexpilotai.com',
  from_name TEXT NOT NULL DEFAULT 'IndexPilot AI',
  reply_to TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  CONSTRAINT singleton CHECK (id = 1)
);

INSERT INTO public.communication_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE public.communication_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read comm settings" ON public.communication_settings
  FOR SELECT USING (true);
CREATE POLICY "Service role full access comm settings" ON public.communication_settings
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admins manage comm settings" ON public.communication_settings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Email send logs
CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT DEFAULT 'brevo',
  provider_message_id TEXT,
  error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user ON public.email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON public.email_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own email logs" ON public.email_logs
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role full access email logs" ON public.email_logs
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admins full access email logs" ON public.email_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Per-user notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT true,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT true,
  trade_alerts BOOLEAN NOT NULL DEFAULT true,
  marketing BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own prefs" ON public.notification_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role full access prefs" ON public.notification_preferences
  FOR ALL USING (true) WITH CHECK (true);
