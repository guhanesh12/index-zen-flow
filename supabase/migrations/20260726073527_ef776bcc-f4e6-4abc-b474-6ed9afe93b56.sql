
-- Auto notification templates (editable by admins)
CREATE TABLE IF NOT EXISTS public.auto_notification_templates (
  event text PRIMARY KEY,
  title text NOT NULL,
  body text NOT NULL,
  image_url text,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.auto_notification_templates TO authenticated;
GRANT ALL    ON public.auto_notification_templates TO service_role;

ALTER TABLE public.auto_notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auto_ntf_admin_read"   ON public.auto_notification_templates;
DROP POLICY IF EXISTS "auto_ntf_admin_write"  ON public.auto_notification_templates;
DROP POLICY IF EXISTS "auto_ntf_admin_update" ON public.auto_notification_templates;

CREATE POLICY "auto_ntf_admin_read"
  ON public.auto_notification_templates FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "auto_ntf_admin_write"
  ON public.auto_notification_templates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

CREATE POLICY "auto_ntf_admin_update"
  ON public.auto_notification_templates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.is_super_admin(auth.uid()));

-- Seed defaults
INSERT INTO public.auto_notification_templates (event, title, body, image_url, enabled) VALUES
  ('market_open',  '🔔 Market Open',   'NSE is now open. Auto-trading engine is live and scanning signals.', NULL, true),
  ('market_close', '🔒 Market Closed', 'NSE trading session has ended. Review today''s P&L in your journal.', NULL, true)
ON CONFLICT (event) DO NOTHING;

-- keep updated_at fresh
DROP TRIGGER IF EXISTS trg_auto_ntf_updated_at ON public.auto_notification_templates;
CREATE TRIGGER trg_auto_ntf_updated_at
  BEFORE UPDATE ON public.auto_notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ensure pg_cron + pg_net
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior versions of these jobs
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobname FROM cron.job WHERE jobname IN ('auto-ntf-cleanup-hourly','auto-ntf-market-open-0900-ist','auto-ntf-market-close-1530-ist') LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
END $$;

-- Cleanup notifications older than 24h — hourly
SELECT cron.schedule(
  'auto-ntf-cleanup-hourly',
  '5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/auto-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='INTERNAL_SYNC_KEY' LIMIT 1),'internal-sync-fallback')),
    body := '{"action":"cleanup"}'::jsonb
  );
  $cron$
);

-- Market Open at 09:00 IST == 03:30 UTC, Mon-Fri (edge fn checks NSE holidays)
SELECT cron.schedule(
  'auto-ntf-market-open-0900-ist',
  '30 3 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/auto-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='INTERNAL_SYNC_KEY' LIMIT 1),'internal-sync-fallback')),
    body := '{"action":"market_open"}'::jsonb
  );
  $cron$
);

-- Market Close at 15:30 IST == 10:00 UTC, Mon-Fri
SELECT cron.schedule(
  'auto-ntf-market-close-1530-ist',
  '0 10 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/auto-notifications',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='INTERNAL_SYNC_KEY' LIMIT 1),'internal-sync-fallback')),
    body := '{"action":"market_close"}'::jsonb
  );
  $cron$
);
