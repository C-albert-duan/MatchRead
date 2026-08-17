-- 0009_sync_facts_cron.sql
-- Point pg_cron at sync-facts (single Tennis API → DB sync).

create or replace function public.invoke_sync_facts()
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
    raise notice 'invoke_sync_facts skipped: Vault secrets not set';
    return null;
  end if;

  v_url := rtrim(v_url, '/') || '/functions/v1/sync-facts';

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  )
  into v_id;

  return v_id;
end;
$$;

comment on function public.invoke_sync_facts() is
  'pg_cron: POST sync-facts — calendar + draws + results into tournaments/players/seats/matches.';

revoke all on function public.invoke_sync_facts() from public, anon, authenticated;

-- Replace old sync-tennis schedule with sync-facts.
select cron.unschedule(jobid) from cron.job where jobname in (
  'sync-tennis-5m',
  'sync-tennis-30m',
  'sync-facts-5m'
);

select cron.schedule(
  'sync-facts-5m',
  '*/5 * * * *',
  $$select public.invoke_sync_facts();$$
);

-- Keep settle on its own cadence (product scoring, not tennis facts).
create or replace function public.invoke_sync_tennis()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Back-compat alias: old callers hit sync-facts.
  return public.invoke_sync_facts();
end;
$$;
