
-- Phase 1: Backend Trading Engine Database Tables

-- 1. Trading Engine State - stores engine on/off per user
CREATE TABLE public.trading_engine_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  is_running BOOLEAN NOT NULL DEFAULT false,
  selected_symbols JSONB DEFAULT '[]'::jsonb,
  strategy_settings JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  stopped_at TIMESTAMP WITH TIME ZONE,
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- 2. Trading Signals - detected signals
CREATE TABLE public.trading_signals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  index_name TEXT,
  price NUMERIC,
  strike_price NUMERIC,
  option_type TEXT,
  expiry TEXT,
  confidence NUMERIC,
  raw_data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'detected',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_trading_signals_user_id ON public.trading_signals(user_id);
CREATE INDEX idx_trading_signals_created_at ON public.trading_signals(created_at);

-- 3. Trading Orders - placed orders
CREATE TABLE public.trading_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  signal_id UUID REFERENCES public.trading_signals(id),
  symbol TEXT NOT NULL,
  index_name TEXT,
  order_type TEXT NOT NULL DEFAULT 'MARKET',
  transaction_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC DEFAULT 0,
  dhan_order_id TEXT,
  exchange_segment TEXT,
  symbol_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  raw_response JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_trading_orders_user_id ON public.trading_orders(user_id);
CREATE INDEX idx_trading_orders_status ON public.trading_orders(status);

-- 4. Position Monitor State - active position tracking
CREATE TABLE public.position_monitor_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  index_name TEXT,
  symbol_id TEXT,
  exchange_segment TEXT,
  entry_price NUMERIC,
  current_price NUMERIC,
  quantity INTEGER DEFAULT 1,
  pnl NUMERIC DEFAULT 0,
  target_amount NUMERIC,
  stop_loss_amount NUMERIC,
  trailing_enabled BOOLEAN DEFAULT false,
  trailing_step NUMERIC,
  highest_pnl NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  exit_reason TEXT,
  exited_at TIMESTAMP WITH TIME ZONE,
  raw_position JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, order_id)
);

CREATE INDEX idx_position_monitor_user_active ON public.position_monitor_state(user_id, is_active);

-- 5. User Symbols - server-side symbol storage
CREATE TABLE public.user_symbols (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol_name TEXT NOT NULL,
  symbol_id TEXT NOT NULL,
  exchange_segment TEXT,
  instrument_type TEXT,
  lot_size INTEGER DEFAULT 1,
  expiry TEXT,
  strike_price NUMERIC,
  option_type TEXT,
  index_name TEXT,
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol_id)
);

CREATE INDEX idx_user_symbols_user_id ON public.user_symbols(user_id);

-- 6. Signal Stats - daily counts for performance section
CREATE TABLE public.signal_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  signal_count INTEGER DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  speed_count INTEGER DEFAULT 0,
  successful_orders INTEGER DEFAULT 0,
  failed_orders INTEGER DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  extra_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, stat_date)
);

CREATE INDEX idx_signal_stats_user_date ON public.signal_stats(user_id, stat_date);

-- Enable RLS on all tables
ALTER TABLE public.trading_engine_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trading_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.position_monitor_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_symbols ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signal_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow service role full access (edge functions use service role)
-- For trading_engine_state
CREATE POLICY "Service role full access on trading_engine_state"
  ON public.trading_engine_state FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read own engine state"
  ON public.trading_engine_state FOR SELECT
  TO anon USING (true);

-- For trading_signals
CREATE POLICY "Service role full access on trading_signals"
  ON public.trading_signals FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read signals"
  ON public.trading_signals FOR SELECT
  TO anon USING (true);

-- For trading_orders
CREATE POLICY "Service role full access on trading_orders"
  ON public.trading_orders FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read orders"
  ON public.trading_orders FOR SELECT
  TO anon USING (true);

-- For position_monitor_state
CREATE POLICY "Service role full access on position_monitor_state"
  ON public.position_monitor_state FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read position monitor"
  ON public.position_monitor_state FOR SELECT
  TO anon USING (true);

-- For user_symbols
CREATE POLICY "Service role full access on user_symbols"
  ON public.user_symbols FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read and write symbols"
  ON public.user_symbols FOR ALL
  TO anon USING (true) WITH CHECK (true);

-- For signal_stats
CREATE POLICY "Service role full access on signal_stats"
  ON public.signal_stats FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read signal stats"
  ON public.signal_stats FOR SELECT
  TO anon USING (true);

-- Auto-update updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add triggers for updated_at
CREATE TRIGGER update_trading_engine_state_updated_at
  BEFORE UPDATE ON public.trading_engine_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trading_orders_updated_at
  BEFORE UPDATE ON public.trading_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_position_monitor_state_updated_at
  BEFORE UPDATE ON public.position_monitor_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_signal_stats_updated_at
  BEFORE UPDATE ON public.signal_stats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
