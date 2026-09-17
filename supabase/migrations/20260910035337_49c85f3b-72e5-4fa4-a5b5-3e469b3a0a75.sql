-- Remove column-level access to secret broker credential fields for end users.
REVOKE SELECT, INSERT, UPDATE ON public.broker_credentials FROM authenticated;
REVOKE SELECT, INSERT, UPDATE ON public.broker_credentials FROM anon;

GRANT SELECT (
  id, user_id, broker, auth_method, dhan_client_id, dhan_client_name, dhan_client_ucc,
  given_power_of_attorney, access_token_expiry, api_key_expiry, redirect_url, postback_url,
  last_consent_app_id, last_token_id, last_status, last_error, created_at, updated_at,
  encrypted_at, kite_user_id, kite_user_name
) ON public.broker_credentials TO authenticated;

GRANT ALL ON public.broker_credentials TO service_role;
