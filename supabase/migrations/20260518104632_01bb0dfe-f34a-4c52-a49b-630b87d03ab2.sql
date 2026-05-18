ALTER TABLE public.trading_engine_state
  ADD COLUMN IF NOT EXISTS auto_resume boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stopped_reason text;