-- 0024_settle_leagues_cron.sql
-- After official results exist, grade submitted brackets every 30 minutes.
-- Uses the same Vault secrets as sync-tennis (project_url + ingest_secret).
-- Offset :15 / :45 so it runs after the :00 / :30 sync-tennis tick.

create or replace function public.invoke_settle_leagues()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, extensions
as $$
declare
  v_url text;
  v_secret text;
  v_id bigint;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets
   where name = 'project_url'
   limit 1;
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'ingest_secret'
   limit 1;

  if v_url is null or v_url = '' or v_secret is null or v_secret = '' then
    raise notice 'invoke_settle_leagues skipped: Vault secrets project_url and ingest_secret are not set';
    return null;
  end if;

  v_url := rtrim(v_url, '/') || '/functions/v1/settle-leagues';

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_id;

  return v_id;
end;
$$;

comment on function public.invoke_settle_leagues() is
  'pg_cron target: POST settle-leagues using Vault project_url + ingest_secret.';

revoke all on function public.invoke_settle_leagues() from public, anon, authenticated;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'settle-leagues-30m';

select cron.schedule(
  'settle-leagues-30m',
  '15,45 * * * *',
  $$select public.invoke_settle_leagues();$$
);
