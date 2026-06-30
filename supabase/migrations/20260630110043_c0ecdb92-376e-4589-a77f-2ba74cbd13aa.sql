DO $$
DECLARE
  jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'position-monitor-1s-loop';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

SELECT cron.schedule(
  'position-monitor-1s-loop',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/position-monitor/loop?durationMs=58000',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"source":"pg_cron","interval":"1s"}'::jsonb,
    timeout_milliseconds := 59000
  );
  $$
);