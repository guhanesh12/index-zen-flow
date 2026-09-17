ALTER TABLE public.trading_orders ADD COLUMN IF NOT EXISTS broker text NOT NULL DEFAULT 'dhan';

CREATE OR REPLACE FUNCTION public.trg_trading_orders_insert_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  broker_label text;
BEGIN
  broker_label := CASE lower(COALESCE(NEW.broker, 'dhan'))
    WHEN 'dhan' THEN 'Dhan'
    WHEN 'zerodha' THEN 'Zerodha'
    WHEN 'groww' THEN 'Groww'
    WHEN 'upstox' THEN 'Upstox'
    WHEN 'fyers' THEN 'Fyers'
    WHEN 'angelone' THEN 'Angel One'
    WHEN 'aliceblue' THEN 'Aliceblue'
    WHEN '5paisa' THEN '5paisa'
    ELSE initcap(COALESCE(NEW.broker, 'Broker'))
  END;

  PERFORM public.notify_push_event(
    'ORDER_PLACED',
    NEW.user_id,
    '🧾 ' || broker_label || ' Order Placed: ' || COALESCE(NEW.symbol, ''),
    UPPER(COALESCE(NEW.transaction_type,'')) || ' ' || COALESCE(NEW.order_type,'') ||
      ' via ' || broker_label ||
      CASE WHEN NEW.signal_id IS NOT NULL THEN ' (signal)' ELSE '' END,
    jsonb_build_object('orderId', NEW.id::text, 'symbol', NEW.symbol, 'broker', COALESCE(NEW.broker,'dhan'), 'url', '/orders')
  );
  RETURN NEW;
END; $function$;