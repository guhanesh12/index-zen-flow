CREATE OR REPLACE FUNCTION public.broker_token_expiries()
RETURNS TABLE(user_id uuid, exp_epoch bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
  tok text;
  payload text;
  padded text;
  j jsonb;
BEGIN
  FOR r IN SELECT bc.user_id AS uid, bc.access_token_encrypted AS ct
           FROM public.broker_credentials bc
           WHERE bc.access_token_encrypted IS NOT NULL
  LOOP
    BEGIN
      tok := public.decrypt_broker_secret(r.ct);
      IF tok IS NULL OR split_part(tok, '.', 2) = '' THEN CONTINUE; END IF;
      payload := replace(replace(split_part(tok, '.', 2), '-', '+'), '_', '/');
      padded := payload || repeat('=', (4 - (length(payload) % 4)) % 4);
      j := convert_from(decode(padded, 'base64'), 'UTF8')::jsonb;
      IF (j ? 'exp') THEN
        user_id := r.uid;
        exp_epoch := (j->>'exp')::bigint;
        RETURN NEXT;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.broker_token_expiries() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.broker_token_expiries() TO service_role;

INSERT INTO public.auto_notification_templates (event, title, body, enabled)
VALUES ('TOKEN_EXPIRING', '🔑 Dhan Token Expiring Soon',
        'Your Dhan access token expires in {minutes} minutes. Update it in Broker Setup to keep auto-trading running.',
        true)
ON CONFLICT (event) DO NOTHING;

INSERT INTO public.auto_notification_templates (event, title, body, enabled)
VALUES ('TOKEN_EXPIRED', '⛔ Dhan Token Expired',
        'Your Dhan access token has expired. Auto-trading is paused until you update it in Broker Setup.',
        true)
ON CONFLICT (event) DO NOTHING;