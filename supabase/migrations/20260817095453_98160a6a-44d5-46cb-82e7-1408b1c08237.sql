ALTER TABLE public.instrument_master
  ADD COLUMN IF NOT EXISTS kite_tradingsymbol text,
  ADD COLUMN IF NOT EXISTS kite_instrument_token text,
  ADD COLUMN IF NOT EXISTS kite_exchange text,
  ADD COLUMN IF NOT EXISTS kite_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_instrument_master_kite_symbol
  ON public.instrument_master (kite_tradingsymbol);

CREATE INDEX IF NOT EXISTS idx_instrument_master_contract
  ON public.instrument_master (index_name, expiry_date, strike_price, option_type);