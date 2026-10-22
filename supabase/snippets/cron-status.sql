-- Read-only. Are the sync and settle jobs scheduled, have they run, and can
-- they reach Edge? Vault values are never selected, only whether they exist.

select
  j.jobname,
  j.schedule,
  j.active,
  d.status as last_status,
  d.start_time as last_run,
  d.return_message,
  (select count(*) from cron.job_run_details x
    where x.jobid = j.jobid and x.start_time > now() - interval '24 hours') as runs_24h,
  exists (
    select 1 from vault.decrypted_secrets
     where name = 'project_url' and coalesce(btrim(decrypted_secret::text), '') <> ''
  ) as vault_project_url,
  exists (
    select 1 from vault.decrypted_secrets
     where name = 'ingest_secret' and coalesce(btrim(decrypted_secret::text), '') <> ''
  ) as vault_ingest_secret
from cron.job j
left join lateral (
  select status, start_time, return_message
    from cron.job_run_details r
   where r.jobid = j.jobid
   order by start_time desc
   limit 1
) d on true
order by j.jobname;
