-- Harden broker_credentials: auto-encrypt trigger now also nulls the
-- plaintext columns (access_token, api_secret, api_key) immediately after
-- encryption so raw secrets can never linger in the row, even if a caller
-- writes to the plaintext columns directly. Also backfill existing rows.

CREATE OR REPLACE FUNCTION public.broker_credentials_auto_encrypt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.access_token IS NOT NULL AND NEW.access_token <> '' THEN
    NEW.access_token_encrypted := public.encrypt_broker_secret(NEW.access_token);
    NEW.encrypted_at := now();
    NEW.access_token := NULL; -- never persist plaintext
  END IF;
  IF NEW.api_secret IS NOT NULL AND NEW.api_secret <> '' THEN
    NEW.api_secret_encrypted := public.encrypt_broker_secret(NEW.api_secret);
    NEW.api_secret := NULL; -- never persist plaintext
  END IF;
  -- api_key is not a secret in most brokers, but a leaked plaintext column
  -- is still surface area — drop it from the row after storing.
  IF NEW.api_key IS NOT NULL AND NEW.api_key <> '' THEN
    NEW.api_key := NULL;
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS broker_credentials_auto_encrypt_trg ON public.broker_credentials;
CREATE TRIGGER broker_credentials_auto_encrypt_trg
BEFORE INSERT OR UPDATE ON public.broker_credentials
FOR EACH ROW
EXECUTE FUNCTION public.broker_credentials_auto_encrypt();

-- Backfill: any existing rows that still hold plaintext get re-encrypted
-- (if not already) and the plaintext columns are nulled.
UPDATE public.broker_credentials
SET
  access_token_encrypted = COALESCE(access_token_encrypted, public.encrypt_broker_secret(access_token)),
  encrypted_at            = COALESCE(encrypted_at, now()),
  access_token            = NULL
WHERE access_token IS NOT NULL AND access_token <> '';

UPDATE public.broker_credentials
SET
  api_secret_encrypted = COALESCE(api_secret_encrypted, public.encrypt_broker_secret(api_secret)),
  api_secret           = NULL
WHERE api_secret IS NOT NULL AND api_secret <> '';

UPDATE public.broker_credentials
SET api_key = NULL
WHERE api_key IS NOT NULL AND api_key <> '';