-- 0007_cron.sql
-- Schedule edge invoke helpers. Reuses Vault project_url + ingest_secret.
-- Does not deploy functions or insert tennis data.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function public.invoke_sync_tennis()
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
    raise notice 'invoke_sync_tennis skipped: Vault secrets project_url and ingest_secret are not set';
    return null;
  end if;

  v_url := rtrim(v_url, '/') || '/functions/v1/sync-tennis';

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{"job":"all"}'::jsonb,
    timeout_milliseconds := 120000
  )
  into v_id;

  return v_id;
end;
$$;

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
    raise notice 'invoke_settle_leagues skipped: Vault secrets not set';
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

comment on function public.invoke_sync_tennis() is
  'pg_cron: POST sync-tennis via Vault. No-op until function is redeployed.';
comment on function public.invoke_settle_leagues() is
  'pg_cron: POST settle-leagues via Vault. No-op until function is redeployed.';

revoke all on function public.invoke_sync_tennis() from public, anon, authenticated;
revoke all on function public.invoke_settle_leagues() from public, anon, authenticated;

-- Clear any old job names, then schedule (calls will 404 until functions redeployed — fine).
select cron.unschedule(jobid) from cron.job where jobname in (
  'sync-tennis-30m',
  'sync-tennis-5m',
  'settle-leagues'
);

select cron.schedule(
  'sync-tennis-5m',
  '*/5 * * * *',
  $$select public.invoke_sync_tennis();$$
);

select cron.schedule(
  'settle-leagues',
  '*/15 * * * *',
  $$select public.invoke_settle_leagues();$$
);
