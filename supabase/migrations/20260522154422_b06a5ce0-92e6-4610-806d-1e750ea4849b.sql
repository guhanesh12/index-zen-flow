
-- ============================================
-- AUTO SYMBOL SELECTION + INSTRUMENT MASTER
-- ============================================

-- 1. Shared instrument master (one row per option contract, refreshed daily)
CREATE TABLE IF NOT EXISTS public.instrument_master (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  security_id TEXT NOT NULL,
  index_name TEXT NOT NULL,
  strike_price NUMERIC NOT NULL,
  option_type TEXT NOT NULL CHECK (option_type IN ('CE','PE')),
  expiry_date DATE NOT NULL,
  lot_size INTEGER NOT NULL DEFAULT 1,
  exchange_segment TEXT NOT NULL,
  tick_size NUMERIC DEFAULT 0.05,
  refreshed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(index_name, expiry_date, option_type, strike_price)
);

CREATE INDEX IF NOT EXISTS idx_instrument_master_lookup
  ON public.instrument_master (index_name, expiry_date, option_type, strike_price);
CREATE INDEX IF NOT EXISTS idx_instrument_master_security ON public.instrument_master (security_id);

ALTER TABLE public.instrument_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read instrument_master"
  ON public.instrument_master FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role full access instrument_master"
  ON public.instrument_master FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Per-user auto symbol configuration (up to 3 slots)
CREATE TABLE IF NOT EXISTS public.user_symbol_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
  index_name TEXT NOT NULL CHECK (index_name IN ('NIFTY','BANKNIFTY','SENSEX')),
  moneyness TEXT NOT NULL DEFAULT 'ATM' CHECK (moneyness IN ('ATM','ITM1','ITM2','OTM1','OTM2')),
  lot_count INTEGER NOT NULL DEFAULT 1 CHECK (lot_count BETWEEN 1 AND 50),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_user_symbol_config_user ON public.user_symbol_config (user_id, enabled);

ALTER TABLE public.user_symbol_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own symbol config"
  ON public.user_symbol_config FOR SELECT TO authenticated
  USING (user_id = (auth.uid())::text);

CREATE POLICY "Users insert own symbol config"
  ON public.user_symbol_config FOR INSERT TO authenticated
  WITH CHECK (user_id = (auth.uid())::text);

CREATE POLICY "Users update own symbol config"
  ON public.user_symbol_config FOR UPDATE TO authenticated
  USING (user_id = (auth.uid())::text) WITH CHECK (user_id = (auth.uid())::text);

CREATE POLICY "Users delete own symbol config"
  ON public.user_symbol_config FOR DELETE TO authenticated
  USING (user_id = (auth.uid())::text);

CREATE POLICY "Service role full access user_symbol_config"
  ON public.user_symbol_config FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER set_user_symbol_config_updated_at
  BEFORE UPDATE ON public.user_symbol_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
