CREATE OR REPLACE FUNCTION public.notify_push_event(_event text, _user_id text, _title text, _body text, _data jsonb DEFAULT '{}'::jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE internal_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO internal_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_SYNC_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN internal_key := NULL;
  END;
  IF internal_key IS NULL OR internal_key = '' THEN
    RAISE NOTICE 'notify_push_event skipped: INTERNAL_SYNC_KEY missing';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object('Content-Type','application/json','x-internal-key', internal_key),
    body := jsonb_build_object('event', _event, 'userId', _user_id, 'title', _title, 'body', _body, 'data', _data)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'notify_push_event failed: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_backend_engine()
 RETURNS void LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE internal_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO internal_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_SYNC_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN internal_key := NULL;
  END;
  IF internal_key IS NULL OR internal_key = '' THEN
    RAISE EXCEPTION 'INTERNAL_SYNC_KEY is not configured in vault';
  END IF;

  PERFORM net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/cron/engine-tick',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0',
      'x-internal-key', internal_key
    ),
    body := '{}'::jsonb
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_position_auto_close_engine_off()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  reason text;
  fn_url text := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/on-position-auto-close';
  internal_key text;
BEGIN
  IF NEW.is_active = false AND (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    reason := lower(COALESCE(NEW.exit_reason, ''));
    IF reason NOT LIKE '%manual%' AND reason NOT LIKE '%user%' THEN
      BEGIN
        SELECT decrypted_secret INTO internal_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_SYNC_KEY' LIMIT 1;
      EXCEPTION WHEN OTHERS THEN internal_key := NULL;
      END;
      IF internal_key IS NULL OR internal_key = '' THEN
        RAISE NOTICE 'auto-close hook skipped: INTERNAL_SYNC_KEY missing';
        RETURN NEW;
      END IF;

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
$function$;