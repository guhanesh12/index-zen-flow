CREATE OR REPLACE FUNCTION public.trg_position_close_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  ev text; ttl text; icon text; pnl_text text; reason text;
BEGIN
  IF NEW.is_active = false AND (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    reason := lower(COALESCE(NEW.exit_reason, ''));
    -- housekeeping deactivations must stay silent
    IF reason LIKE '%duplicate%' OR reason LIKE '%housekeep%' OR reason LIKE '%cleanup%' OR reason LIKE '%stale row%' THEN
      RETURN NEW;
    END IF;
    pnl_text := to_char(COALESCE(NEW.pnl, 0), 'FM999999990.00');
    IF COALESCE(NEW.pnl, 0) >= 0 THEN
      ev := 'POSITION_CLOSED_PROFIT'; icon := '✅'; ttl := icon || ' Position Closed +₹' || pnl_text;
    ELSE
      ev := 'POSITION_CLOSED_LOSS'; icon := '🔻'; ttl := icon || ' Position Closed -₹' || replace(pnl_text,'-','');
    END IF;
    PERFORM public.notify_push_event(
      ev, NEW.user_id, ttl,
      COALESCE(NEW.symbol,'') || ' | Reason: ' || COALESCE(NEW.exit_reason,'closed'),
      jsonb_build_object('orderId', COALESCE(NEW.order_id,''), 'symbol', COALESCE(NEW.symbol,''), 'pnl', NEW.pnl, 'url', '/positions')
    );
  END IF;
  RETURN NEW;
END; $$;

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
    IF reason NOT LIKE '%manual%' AND reason NOT LIKE '%user%'
       AND reason NOT LIKE '%duplicate%' AND reason NOT LIKE '%housekeep%'
       AND reason NOT LIKE '%cleanup%' AND reason NOT LIKE '%stale row%' THEN
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

REVOKE EXECUTE ON FUNCTION public.trg_position_close_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_position_auto_close_engine_off() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trg_position_close_notify() TO service_role;
GRANT EXECUTE ON FUNCTION public.trg_position_auto_close_engine_off() TO service_role;