DO $$
BEGIN
  PERFORM cron.unschedule('trading-engine-executor');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'trading-engine-executor',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/cron/engine-tick',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0"}'::jsonb,
    body := '{"source":"pg_cron"}'::jsonb
  );
  $$
);

CREATE OR REPLACE FUNCTION public.execute_backend_engine()
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/cron/engine-tick',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYXNlIiwicmVmIjoib2tsZ3FlbGNhdWp4bnRnanl1aXMiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc1OTUxMDQ2NSwiZXhwIjoyMDc1MDg2NDY1fQ.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0"}'::jsonb,
    body := '{}'::jsonb
  );
END;
$function$;