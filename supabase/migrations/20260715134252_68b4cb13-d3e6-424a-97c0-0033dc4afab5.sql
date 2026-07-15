
-- 🔒 Revoke EXECUTE on sensitive SECURITY DEFINER functions from anon/authenticated
-- These are internal helpers (broker encryption, cron, triggers) that must
-- never be callable directly by clients through the Data API.

DO $$
DECLARE
  fn text;
  sig text;
BEGIN
  FOR fn, sig IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'encrypt_broker_secret',
        'decrypt_broker_secret',
        'get_broker_encryption_key',
        'execute_backend_engine',
        'expire_signup_bonuses',
        'notify_push_event',
        'handle_new_user',
        'broker_credentials_auto_encrypt',
        'protect_super_admin',
        'protect_super_admin_permissions',
        'auto_suspend_on_brute_force',
        'trg_wallet_transactions_notify',
        'trg_trading_signals_notify',
        'trg_trading_orders_insert_notify',
        'trg_position_close_notify',
        'trg_engine_state_notify',
        'trg_position_auto_close_engine_off',
        'update_updated_at_column',
        'generate_client_id'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', fn, sig);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO service_role', fn, sig);
  END LOOP;
END $$;
