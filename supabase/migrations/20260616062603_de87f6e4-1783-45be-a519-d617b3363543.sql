DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'kv_store_c4d79cb7'
      AND indexname NOT IN ('kv_store_c4d79cb7_pkey', 'kv_store_c4d79cb7_key_idx')
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.indexname);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS kv_store_c4d79cb7_key_idx
ON public.kv_store_c4d79cb7 USING btree (key text_pattern_ops);

CREATE INDEX IF NOT EXISTS trading_signals_user_created_idx
ON public.trading_signals (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS trading_orders_user_created_idx
ON public.trading_orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS signal_stats_user_date_idx
ON public.signal_stats (user_id, stat_date);

CREATE INDEX IF NOT EXISTS position_monitor_user_active_created_idx
ON public.position_monitor_state (user_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS trading_engine_state_user_running_idx
ON public.trading_engine_state (user_id, is_running);