ALTER TABLE public.kill_switch_config
  ADD COLUMN IF NOT EXISTS sl_tp_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS nifty_target_per_lot numeric NOT NULL DEFAULT 6000,
  ADD COLUMN IF NOT EXISTS nifty_stop_per_lot numeric NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS banknifty_target_per_lot numeric NOT NULL DEFAULT 6000,
  ADD COLUMN IF NOT EXISTS banknifty_stop_per_lot numeric NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS sensex_target_per_lot numeric NOT NULL DEFAULT 6000,
  ADD COLUMN IF NOT EXISTS sensex_stop_per_lot numeric NOT NULL DEFAULT 3000,
  ADD COLUMN IF NOT EXISTS trailing_enabled boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'kill_switch_config_sl_tp_mode_chk'
  ) THEN
    ALTER TABLE public.kill_switch_config
      ADD CONSTRAINT kill_switch_config_sl_tp_mode_chk CHECK (sl_tp_mode IN ('auto','manual'));
  END IF;
END $$;