
-- Broker OAuth credentials table
CREATE TABLE IF NOT EXISTS public.broker_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  broker text NOT NULL DEFAULT 'dhan',
  auth_method text NOT NULL DEFAULT 'access_token', -- 'access_token' | 'api_key'
  dhan_client_id text,
  dhan_client_name text,
  dhan_client_ucc text,
  given_power_of_attorney boolean DEFAULT false,
  api_key text,
  api_secret text, -- never returned to client
  access_token text,
  access_token_expiry timestamptz,
  api_key_expiry timestamptz,
  redirect_url text,
  postback_url text,
  last_consent_app_id text,
  last_token_id text,
  last_status text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, broker)
);

ALTER TABLE public.broker_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access broker_credentials"
  ON public.broker_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Users view own broker_credentials"
  ON public.broker_credentials FOR SELECT TO authenticated
  USING (user_id = (auth.uid())::text);

CREATE TRIGGER trg_broker_credentials_updated_at
  BEFORE UPDATE ON public.broker_credentials
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_broker_credentials_user ON public.broker_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_credentials_token_expiry ON public.broker_credentials(access_token_expiry);
