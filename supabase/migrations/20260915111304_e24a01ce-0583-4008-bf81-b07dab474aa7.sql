ALTER TABLE public.trading_signals
  ADD COLUMN IF NOT EXISTS signal_code text,
  ADD COLUMN IF NOT EXISTS strategy_id text,
  ADD COLUMN IF NOT EXISTS algo_id text;

ALTER TABLE public.trading_orders
  ADD COLUMN IF NOT EXISTS signal_code text,
  ADD COLUMN IF NOT EXISTS order_code text,
  ADD COLUMN IF NOT EXISTS strategy_id text,
  ADD COLUMN IF NOT EXISTS algo_id text,
  ADD COLUMN IF NOT EXISTS average_price numeric;

CREATE INDEX IF NOT EXISTS idx_trading_signals_signal_code ON public.trading_signals(signal_code);
CREATE INDEX IF NOT EXISTS idx_trading_orders_signal_code ON public.trading_orders(signal_code);
CREATE INDEX IF NOT EXISTS idx_trading_orders_created_at ON public.trading_orders(created_at DESC);

CREATE TABLE IF NOT EXISTS public.order_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  user_email text,
  order_code text,
  broker_order_id text,
  signal_code text,
  strategy_id text,
  algo_id text,
  broker text,
  index_name text,
  symbol text,
  event text NOT NULL,
  transaction_type text,
  quantity integer,
  average_price numeric,
  status text NOT NULL DEFAULT 'success',
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.order_audit_events TO authenticated;
GRANT ALL ON public.order_audit_events TO service_role;
ALTER TABLE public.order_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view all order audit events" ON public.order_audit_events
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users view own order audit events" ON public.order_audit_events
  FOR SELECT TO authenticated USING (user_id = (auth.uid())::text);
CREATE POLICY "Service role full access order audit events" ON public.order_audit_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_order_audit_created_at ON public.order_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_audit_order_code ON public.order_audit_events(order_code);

CREATE TABLE IF NOT EXISTS public.strategy_control (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  strategy_id text NOT NULL DEFAULT 'STG-IPAI-V3',
  enabled boolean NOT NULL DEFAULT true,
  nifty_enabled boolean NOT NULL DEFAULT true,
  banknifty_enabled boolean NOT NULL DEFAULT true,
  sensex_enabled boolean NOT NULL DEFAULT true,
  min_confidence integer NOT NULL DEFAULT 75,
  max_trades_per_index_per_day integer NOT NULL DEFAULT 1,
  entry_start_ist text NOT NULL DEFAULT '09:30',
  entry_end_ist text NOT NULL DEFAULT '15:00',
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.strategy_control TO authenticated;
GRANT ALL ON public.strategy_control TO service_role;
ALTER TABLE public.strategy_control ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read strategy control" ON public.strategy_control
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage strategy control" ON public.strategy_control
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access strategy control" ON public.strategy_control
  FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.strategy_control (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.kill_switch_config (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  trading_enabled boolean NOT NULL DEFAULT true,
  new_signals_enabled boolean NOT NULL DEFAULT true,
  new_orders_enabled boolean NOT NULL DEFAULT true,
  broker_connect_enabled boolean NOT NULL DEFAULT true,
  strategy_creation_enabled boolean NOT NULL DEFAULT true,
  backtest_enabled boolean NOT NULL DEFAULT true,
  note text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.kill_switch_config TO authenticated;
GRANT ALL ON public.kill_switch_config TO service_role;
ALTER TABLE public.kill_switch_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read kill switch" ON public.kill_switch_config
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage kill switch" ON public.kill_switch_config
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access kill switch" ON public.kill_switch_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO public.kill_switch_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.user_kill_switch (
  user_id uuid PRIMARY KEY,
  new_signals_enabled boolean NOT NULL DEFAULT true,
  new_orders_enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.user_kill_switch TO authenticated;
GRANT ALL ON public.user_kill_switch TO service_role;
ALTER TABLE public.user_kill_switch ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own kill switch" ON public.user_kill_switch
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins manage all user kill switches" ON public.user_kill_switch
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Service role full access user kill switch" ON public.user_kill_switch
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins view all trading orders" ON public.trading_orders
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins view all trading signals" ON public.trading_signals
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins view all positions" ON public.position_monitor_state
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));