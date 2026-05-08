-- 09:08 IST = 03:38 UTC. Mon-Fri only at the cron level; holidays handled in code.
SELECT cron.unschedule('premarket-email-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='premarket-email-daily');
SELECT cron.schedule(
  'premarket-email-daily',
  '38 3 * * 1-5',
  $$ select net.http_post(
       url:='https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/cron/premarket-email',
       headers:='{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9rbGdxZWxjYXVqeG50Z2p5dWlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk1MTA0NjUsImV4cCI6MjA3NTA4NjQ2NX0.FnFcNQXGXGpsQXvR4TW1LDc23FlIBBglLhZsRdn9VV0"}'::jsonb,
       body:='{}'::jsonb
     ) as request_id; $$
);