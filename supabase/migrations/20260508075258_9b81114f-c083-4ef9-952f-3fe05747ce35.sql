
-- Default user email notifications to OFF
ALTER TABLE public.notification_preferences ALTER COLUMN email_enabled SET DEFAULT false;
ALTER TABLE public.notification_preferences ALTER COLUMN sms_enabled SET DEFAULT false;
ALTER TABLE public.notification_preferences ALTER COLUMN whatsapp_enabled SET DEFAULT false;

-- Reset all current rows to OFF (user must opt-in explicitly + accept ₹5/day debit)
UPDATE public.notification_preferences SET email_enabled = false, sms_enabled = false, whatsapp_enabled = false;

-- Track daily notification billing to avoid double-debit
CREATE TABLE IF NOT EXISTS public.notification_billing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  billed_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'success',
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, billed_date)
);
ALTER TABLE public.notification_billing_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own billing log" ON public.notification_billing_log
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Service role full access billing" ON public.notification_billing_log
  FOR ALL USING (true) WITH CHECK (true);
