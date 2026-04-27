-- Schedule auto position monitor every 60 seconds
-- This calls the position-monitor/tick edge function which:
--  1. Auto-imports any open broker position not yet tracked in position_monitor_state
--  2. Updates LTP / P&L / highest P&L from Dhan
--  3. Triggers exit on Target hit, Stop Loss hit, or Trailing SL hit
--  4. Auto-debits wallet (tier-based) on realized profit

-- Remove any prior schedule with this name (safe re-run)
DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'position-auto-monitor-60s';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'position-auto-monitor-60s',
  '* * * * *',  -- every minute (pg_cron min granularity)
  $$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/position-monitor/tick',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);