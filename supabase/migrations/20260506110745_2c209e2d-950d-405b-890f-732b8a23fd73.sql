-- Enable scheduler extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove old jobs if rerun
DO $$
BEGIN
  PERFORM cron.unschedule('vps-auto-shutdown-1531-ist');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('vps-auto-startup-0855-ist');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 15:31 IST = 10:01 UTC, Mon-Fri
SELECT cron.schedule(
  'vps-auto-shutdown-1531-ist',
  '1 10 * * 1-5',
  $cmd$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/vps-power/auto-shutdown',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $cmd$
);

-- 08:55 IST = 03:25 UTC, Mon-Fri
SELECT cron.schedule(
  'vps-auto-startup-0855-ist',
  '25 3 * * 1-5',
  $cmd$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/vps-power/auto-startup',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  );
  $cmd$
);