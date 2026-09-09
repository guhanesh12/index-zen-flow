-- 1) Immediate cleanup of positions carried over from previous sessions
UPDATE public.position_monitor_state
SET is_active = false,
    exit_reason = COALESCE(exit_reason, 'Auto-cleared: stale position from a previous session'),
    exited_at = COALESCE(exited_at, now()),
    updated_at = now()
WHERE is_active = true
  AND created_at < date_trunc('day', (now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata';

-- 2) Function used by the scheduled job
CREATE OR REPLACE FUNCTION public.clear_stale_position_monitor_rows()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cleared integer;
BEGIN
  UPDATE public.position_monitor_state
  SET is_active = false,
      exit_reason = COALESCE(exit_reason, 'Auto-cleared: stale position from a previous session'),
      exited_at = COALESCE(exited_at, now()),
      updated_at = now()
  WHERE is_active = true
    AND created_at < date_trunc('day', (now() AT TIME ZONE 'Asia/Kolkata')) AT TIME ZONE 'Asia/Kolkata';

  GET DIAGNOSTICS cleared = ROW_COUNT;
  RETURN cleared;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_stale_position_monitor_rows() FROM PUBLIC, anon, authenticated;

-- 3) Schedule it every trading morning at 09:00 IST (03:30 UTC)
SELECT cron.unschedule('clear-stale-positions-0900-ist')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'clear-stale-positions-0900-ist');

SELECT cron.schedule(
  'clear-stale-positions-0900-ist',
  '30 3 * * 1-5',
  $$SELECT public.clear_stale_position_monitor_rows();$$
);