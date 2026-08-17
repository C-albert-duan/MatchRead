-- 0025_sync_tennis_5m.sql
-- Mega live facts: poll Tennis API every 5 minutes. Job name stays
-- sync-tennis-30m so unschedule in 0023 still matches.

select cron.unschedule(jobid)
  from cron.job
 where jobname in ('sync-tennis-30m', 'sync-tennis-5m');

select cron.schedule(
  'sync-tennis-5m',
  '*/5 * * * *',
  $$select public.invoke_sync_tennis();$$
);

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'settle-leagues-30m';

select cron.schedule(
  'settle-leagues-5m',
  '2-57/5 * * * *',
  $$select public.invoke_settle_leagues();$$
);
