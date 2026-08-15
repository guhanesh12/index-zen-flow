select cron.unschedule('engine-candle-watch-1s') where exists (select 1 from cron.job where jobname='engine-candle-watch-1s');

select cron.schedule(
  'engine-candle-watch-1s',
  '* 3-10 * * 1-5',
  $$
  SELECT net.http_post(
    url := 'https://oklgqelcaujxntgjyuis.supabase.co/functions/v1/make-server-c4d79cb7/cron/candle-watch?durationMs=58000',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"source":"pg_cron","mode":"candle-watch"}'::jsonb,
    timeout_milliseconds := 59000
  );
  $$
);