
-- ============ Referral codes: stop enumeration ============
DROP POLICY IF EXISTS "Authenticated can lookup referral codes" ON public.referral_codes;
CREATE POLICY "Users view their own referral_code"
ON public.referral_codes FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Secure lookup helper for the signup/referral validation flow (does not leak codes).
CREATE OR REPLACE FUNCTION public.is_valid_referral_code(_code text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.referral_codes WHERE upper(code) = upper(_code));
$$;
REVOKE ALL ON FUNCTION public.is_valid_referral_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_referral_code(text) TO authenticated, service_role;

-- ============ broker_credentials: owner-scoped writes ============
DROP POLICY IF EXISTS "Suspended users blocked - broker_credentials" ON public.broker_credentials;
CREATE POLICY "Users insert own broker_credentials"
ON public.broker_credentials FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid()::text AND public.is_account_active(auth.uid()));
CREATE POLICY "Users update own broker_credentials"
ON public.broker_credentials FOR UPDATE TO authenticated
USING (user_id = auth.uid()::text AND public.is_account_active(auth.uid()))
WITH CHECK (user_id = auth.uid()::text);
CREATE POLICY "Users delete own broker_credentials"
ON public.broker_credentials FOR DELETE TO authenticated
USING (user_id = auth.uid()::text);

-- ============ KV stores: explicit service-role-only ============
CREATE POLICY "Service role only kv_store_c4d79cb7"
ON public.kv_store_c4d79cb7 FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role only kv_store_4e940498"
ON public.kv_store_4e940498 FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role only kv_store_5b8b3994"
ON public.kv_store_5b8b3994 FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============ Revoke EXECUTE on SECURITY DEFINER / dangerous helpers from anon & authenticated ============
REVOKE EXECUTE ON FUNCTION public.encrypt_broker_secret(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.decrypt_broker_secret(bytea) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_broker_encryption_key() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_backend_engine() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_signup_bonuses() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auto_suspend_on_brute_force() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.broker_credentials_auto_encrypt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_client_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referral_code_exists(text) FROM PUBLIC, anon, authenticated;

-- http extension wrappers: do not expose to client roles
REVOKE EXECUTE ON FUNCTION public.http(public.http_request) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_get(varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_get(varchar, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_post(varchar, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_post(varchar, varchar, varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_put(varchar, varchar, varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_patch(varchar, varchar, varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_delete(varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_delete(varchar, varchar, varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_head(varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_set_curlopt(varchar, varchar) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_reset_curlopt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.http_list_curlopt() FROM PUBLIC, anon, authenticated;

-- ============ Storage: avatars bucket should not be listable by anonymous ============
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated can list avatars"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'avatars');
-- Direct URL fetches still work because the 'avatars' bucket is marked public.
