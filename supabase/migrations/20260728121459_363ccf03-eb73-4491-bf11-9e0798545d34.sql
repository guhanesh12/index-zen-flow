-- 1) user_pins
CREATE TABLE IF NOT EXISTS public.user_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  pin_salt text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_pins TO authenticated;
GRANT ALL ON public.user_pins TO service_role;

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_pins_select_own" ON public.user_pins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_pins_insert_own" ON public.user_pins
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_pins_update_own" ON public.user_pins
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_pins_delete_own" ON public.user_pins
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER user_pins_updated_at
  BEFORE UPDATE ON public.user_pins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) pin_reset_otps  (server-only)
CREATE TABLE IF NOT EXISTS public.pin_reset_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile text NOT NULL,
  otp_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.pin_reset_otps TO service_role;
ALTER TABLE public.pin_reset_otps ENABLE ROW LEVEL SECURITY;
-- no policies: only service_role via edge function

CREATE INDEX IF NOT EXISTS pin_reset_otps_user_idx
  ON public.pin_reset_otps (user_id, created_at DESC);