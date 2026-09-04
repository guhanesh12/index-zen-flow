CREATE OR REPLACE FUNCTION public.trg_position_auto_close_engine_off()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  reason text;
  fn_url text := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/on-position-auto-close';
  internal_key text;
BEGIN
  IF NEW.is_active = false AND (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    reason := lower(COALESCE(NEW.exit_reason, ''));
    IF reason NOT LIKE '%manual%' AND reason NOT LIKE '%user%'
       AND reason NOT LIKE '%duplicate%' AND reason NOT LIKE '%housekeep%'
       AND reason NOT LIKE '%cleanup%' AND reason NOT LIKE '%stale row%'
       AND reason NOT LIKE '%external%' THEN
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

UPDATE public.trading_engine_state
SET is_running = true,
    stopped_at = NULL,
    stopped_reason = NULL,
    last_heartbeat = now(),
    updated_at = now()
WHERE user_id = 'ae08130c-d5dd-4b7b-b29f-d2bbc9d97d9f'
  AND is_running = false
  AND stopped_reason LIKE '%closed externally%';