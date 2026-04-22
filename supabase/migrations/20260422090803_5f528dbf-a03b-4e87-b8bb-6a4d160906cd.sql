-- Remove duplicate cron jobs that conflict with the main engine-tick scheduler
SELECT cron.unschedule(10);
SELECT cron.unschedule(11);