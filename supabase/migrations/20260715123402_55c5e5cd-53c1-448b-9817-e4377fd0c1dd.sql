
-- 1) email_campaigns table for admin broadcast mailer
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  admin_email text,
  segment text NOT NULL,
  segment_filter jsonb DEFAULT '{}'::jsonb,
  subject text NOT NULL,
  heading text,
  body text NOT NULL,
  cta_label text,
  cta_url text,
  banner_url text,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.email_campaigns TO authenticated;
GRANT ALL ON public.email_campaigns TO service_role;

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view campaigns"
  ON public.email_campaigns FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'communication','view'));

CREATE POLICY "Admins can insert campaigns"
  ON public.email_campaigns FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'communication','create'));

CREATE POLICY "Admins can update campaigns"
  ON public.email_campaigns FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'communication','edit'));

CREATE TRIGGER trg_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link email_logs -> campaign for delivery reports
ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON public.email_logs(campaign_id);

-- 2) Position auto-close -> engine off + email
CREATE OR REPLACE FUNCTION public.trg_position_auto_close_engine_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  reason text;
  fn_url text := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/on-position-auto-close';
  internal_key text;
BEGIN
  IF NEW.is_active = false AND (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    reason := lower(COALESCE(NEW.exit_reason, ''));
    -- Only auto-triggered exits (not manual). Treat empty as auto too.
    IF reason NOT LIKE '%manual%' AND reason NOT LIKE '%user%' THEN
      BEGIN
        SELECT decrypted_secret INTO internal_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_SYNC_KEY' LIMIT 1;
      EXCEPTION WHEN OTHERS THEN internal_key := NULL;
      END;
      IF internal_key IS NULL THEN internal_key := 'internal-sync-fallback'; END IF;

      BEGIN
        PERFORM net.http_post(
          url := fn_url,
          headers := jsonb_build_object('Content-Type','application/json','x-internal-key', internal_key),
          body := jsonb_build_object(
            'user_id', NEW.user_id,
            'symbol', COALESCE(NEW.symbol, ''),
            'entry_price', NEW.entry_price,
            'exit_price', NEW.current_price,
            'pnl', COALESCE(NEW.pnl, 0),
            'quantity', COALESCE(NEW.quantity, 0),
            'exit_reason', COALESCE(NEW.exit_reason, 'auto_exit'),
            'order_id', COALESCE(NEW.order_id, '')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'trg_position_auto_close_engine_off http_post failed: %', SQLERRM;
      END;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_position_auto_close_engine_off ON public.position_monitor_state;
CREATE TRIGGER trg_position_auto_close_engine_off
  AFTER UPDATE ON public.position_monitor_state
  FOR EACH ROW EXECUTE FUNCTION public.trg_position_auto_close_engine_off();
