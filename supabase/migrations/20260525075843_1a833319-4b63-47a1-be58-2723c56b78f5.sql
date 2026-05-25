
ALTER TABLE public.user_symbol_config
  ADD COLUMN IF NOT EXISTS target_per_lot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stop_loss_per_lot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trailing_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trailing_activation_per_lot numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trailing_step_per_lot numeric NOT NULL DEFAULT 0;
