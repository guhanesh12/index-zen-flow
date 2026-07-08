
-- Helper: fire-and-forget HTTP POST to push-notify edge function
CREATE OR REPLACE FUNCTION public.notify_push_event(
  _event text,
  _user_id text,
  _title text,
  _body text,
  _data jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  internal_key text;
BEGIN
  -- Read INTERNAL_SYNC_KEY from vault if available, else use env-known value
  BEGIN
    SELECT decrypted_secret INTO internal_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_SYNC_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN internal_key := NULL;
  END;
  IF internal_key IS NULL THEN
    internal_key := 'internal-sync-fallback';
  END IF;

  PERFORM net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', internal_key
    ),
    body := jsonb_build_object(
      'event', _event,
      'userId', _user_id,
      'title', _title,
      'body', _body,
      'data', _data
    )
  );
EXCEPTION WHEN OTHERS THEN
  -- Never block the originating transaction
  RAISE NOTICE 'notify_push_event failed: %', SQLERRM;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- WALLET credit / debit
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_wallet_transactions_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev text;
  ttl text;
  bod text;
  amt text;
BEGIN
  amt := to_char(COALESCE(NEW.amount, 0), 'FM999999990.00');
  IF NEW.type IN ('credit','bonus','refund','profit','referral','signup_bonus') THEN
    ev := 'WALLET_CREDIT';
    ttl := '💰 Wallet Credited';
    bod := '₹' || amt || ' credited: ' || COALESCE(NEW.description, NEW.type);
  ELSIF NEW.type IN ('debit','deduction','fee','loss','bonus_expired') THEN
    ev := 'WALLET_DEBIT';
    ttl := '💸 Wallet Debited';
    bod := '₹' || amt || ' debited: ' || COALESCE(NEW.description, NEW.type);
  ELSE
    RETURN NEW;
  END IF;

  PERFORM public.notify_push_event(
    ev, NEW.user_id::text, ttl, bod,
    jsonb_build_object('amount', NEW.amount, 'type', NEW.type, 'ref', COALESCE(NEW.reference_id,''), 'url', '/wallet')
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS wallet_transactions_notify ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_notify
AFTER INSERT ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_wallet_transactions_notify();

-- ═══════════════════════════════════════════════════════════════
-- TRADING SIGNAL generated
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_trading_signals_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_push_event(
    'SIGNAL_GENERATED',
    NEW.user_id,
    '📡 New Signal: ' || COALESCE(NEW.index_name, NEW.symbol),
    UPPER(COALESCE(NEW.signal_type,'SIGNAL')) || ' @ ₹' || COALESCE(NEW.price::text,'-') ||
      CASE WHEN NEW.strike_price IS NOT NULL THEN ' | Strike ' || NEW.strike_price::text ELSE '' END ||
      CASE WHEN NEW.option_type IS NOT NULL THEN ' ' || NEW.option_type ELSE '' END,
    jsonb_build_object('symbol', NEW.symbol, 'signalType', NEW.signal_type, 'signalId', NEW.id::text, 'url', '/signals')
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trading_signals_notify ON public.trading_signals;
CREATE TRIGGER trading_signals_notify
AFTER INSERT ON public.trading_signals
FOR EACH ROW EXECUTE FUNCTION public.trg_trading_signals_notify();

-- ═══════════════════════════════════════════════════════════════
-- ORDER placed (insert) + position closed (status update)
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_trading_orders_insert_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_push_event(
    'ORDER_PLACED',
    NEW.user_id,
    '🧾 Order Placed: ' || COALESCE(NEW.symbol, ''),
    UPPER(COALESCE(NEW.transaction_type,'')) || ' ' || COALESCE(NEW.order_type,'') ||
      CASE WHEN NEW.signal_id IS NOT NULL THEN ' (signal)' ELSE '' END,
    jsonb_build_object('orderId', NEW.id::text, 'symbol', NEW.symbol, 'url', '/orders')
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trading_orders_insert_notify ON public.trading_orders;
CREATE TRIGGER trading_orders_insert_notify
AFTER INSERT ON public.trading_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_trading_orders_insert_notify();

-- ═══════════════════════════════════════════════════════════════
-- POSITION close: profit / loss based on pnl
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_position_close_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev text; ttl text; icon text; pnl_text text;
BEGIN
  -- fire only when transitioning from active -> inactive
  IF NEW.is_active = false AND (OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
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

DROP TRIGGER IF EXISTS position_monitor_close_notify ON public.position_monitor_state;
CREATE TRIGGER position_monitor_close_notify
AFTER UPDATE ON public.position_monitor_state
FOR EACH ROW EXECUTE FUNCTION public.trg_position_close_notify();

-- ═══════════════════════════════════════════════════════════════
-- ENGINE on / off
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.trg_engine_state_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ev text; ttl text; bod text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_running THEN
      ev := 'ENGINE_ON'; ttl := '▶️ Trading Engine Started'; bod := 'Your automated trading engine is now running.';
    ELSE RETURN NEW; END IF;
  ELSE
    IF OLD.is_running IS DISTINCT FROM NEW.is_running THEN
      IF NEW.is_running THEN
        ev := 'ENGINE_ON'; ttl := '▶️ Trading Engine Started'; bod := 'Your automated trading engine is now running.';
      ELSE
        ev := 'ENGINE_OFF'; ttl := '⏹️ Trading Engine Stopped';
        bod := 'Engine stopped' || CASE WHEN NEW.stopped_reason IS NOT NULL THEN ' — ' || NEW.stopped_reason ELSE '' END;
      END IF;
    ELSE RETURN NEW; END IF;
  END IF;

  PERFORM public.notify_push_event(
    ev, NEW.user_id, ttl, bod,
    jsonb_build_object('url', '/dashboard')
  );
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS engine_state_notify ON public.trading_engine_state;
CREATE TRIGGER engine_state_notify
AFTER INSERT OR UPDATE ON public.trading_engine_state
FOR EACH ROW EXECUTE FUNCTION public.trg_engine_state_notify();
