CREATE TABLE IF NOT EXISTS public.market_data_credentials (
  id smallint PRIMARY KEY DEFAULT 1,
  dhan_client_id text,
  access_token_encrypted bytea,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'unknown',
  last_error text,
  token_expiry timestamptz,
  last_verified_at timestamptz,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_data_credentials_singleton CHECK (id = 1)
);

GRANT ALL ON public.market_data_credentials TO service_role;

ALTER TABLE public.market_data_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages market data credentials" ON public.market_data_credentials;
CREATE POLICY "service role manages market data credentials"
ON public.market_data_credentials FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_market_data_credentials(
  _client_id text,
  _access_token text,
  _enabled boolean DEFAULT true,
  _updated_by uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  INSERT INTO public.market_data_credentials (id, dhan_client_id, access_token_encrypted, enabled, status, updated_by, updated_at)
  VALUES (
    1,
    _client_id,
    CASE WHEN _access_token IS NULL OR _access_token = '' THEN NULL ELSE public.encrypt_broker_secret(_access_token) END,
    COALESCE(_enabled, true),
    'unknown',
    _updated_by,
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    dhan_client_id = COALESCE(EXCLUDED.dhan_client_id, public.market_data_credentials.dhan_client_id),
    access_token_encrypted = COALESCE(EXCLUDED.access_token_encrypted, public.market_data_credentials.access_token_encrypted),
    enabled = COALESCE(EXCLUDED.enabled, public.market_data_credentials.enabled),
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_market_data_credentials()
RETURNS TABLE(dhan_client_id text, access_token text, enabled boolean, status text, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  SELECT m.dhan_client_id,
         public.decrypt_broker_secret(m.access_token_encrypted),
         m.enabled,
         m.status,
         m.updated_at
  FROM public.market_data_credentials m
  WHERE m.id = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.set_market_data_credentials(text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_market_data_credentials() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_market_data_credentials(text, text, boolean, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_market_data_credentials() TO service_role;