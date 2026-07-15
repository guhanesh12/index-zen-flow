
-- 1) Update execute_backend_engine to include x-internal-key
CREATE OR REPLACE FUNCTION public.execute_backend_engine()
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  internal_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO internal_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_SYNC_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN internal_key := NULL;
  END;
  IF internal_key IS NULL THEN internal_key := 'internal-sync-fallback'; END IF;

  PERFORM net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/cron/engine-tick',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0',
      'x-internal-key', internal_key
    ),
    body := '{}'::jsonb
  );
END;
$function$;

-- 2) Update every pg_cron job that calls our cron/* or vps-power/auto-* endpoints
-- to include the x-internal-key header. We rewrite the command in place.
DO $$
DECLARE
  j record;
  new_cmd text;
  internal_key text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO internal_key FROM vault.decrypted_secrets WHERE name = 'INTERNAL_SYNC_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN internal_key := NULL;
  END;
  IF internal_key IS NULL THEN internal_key := 'internal-sync-fallback'; END IF;

  FOR j IN
    SELECT jobid, jobname, command
    FROM cron.job
    WHERE command ILIKE '%make-server-c4d79cb7/cron/%'
       OR command ILIKE '%make-server-c4d79cb7/vps-power/auto-%'
  LOOP
    -- If command already contains x-internal-key, skip
    IF j.command ILIKE '%x-internal-key%' THEN
      CONTINUE;
    END IF;

    -- Inject header into jsonb_build_object(...) calls
    new_cmd := regexp_replace(
      j.command,
      'jsonb_build_object\(\s*''Content-Type''\s*,\s*''application/json''',
      'jsonb_build_object(''Content-Type'',''application/json'',''x-internal-key'','''
        || replace(internal_key, '''', '''''') || '''',
      'gi'
    );

    -- Inject into raw JSON header strings like '{"Content-Type":"application/json", ...}'
    new_cmd := regexp_replace(
      new_cmd,
      '"Content-Type"\s*:\s*"application/json"',
      '"Content-Type":"application/json","x-internal-key":"'
        || replace(internal_key, '"', '\"') || '"',
      'gi'
    );

    IF new_cmd <> j.command THEN
      PERFORM cron.alter_job(job_id := j.jobid, command := new_cmd);
    END IF;
  END LOOP;
END $$;

-- 3) Lock down SECURITY DEFINER helpers: revoke EXECUTE from PUBLIC/anon/authenticated,
-- then grant back only what the app / RLS actually needs.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Grant EXECUTE back to authenticated only for helpers used from RLS or client-side flows
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_hotkey_available(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_referral_code(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.referral_code_exists(text) TO authenticated, anon;
