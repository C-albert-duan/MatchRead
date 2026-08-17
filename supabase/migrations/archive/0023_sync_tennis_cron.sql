-- 0023_sync_tennis_cron.sql
-- Supabase-only clock: pg_cron every 30 minutes POSTs sync-tennis.
-- No GitHub required. Do not put RAPIDAPI_KEY or INGEST_SECRET in this file.
--
-- One-time after db push (SQL editor) — Vault, not Edge Function secrets:
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same as supabase secrets INGEST_SECRET>', 'ingest_secret');
-- Until those two Vault names exist, invoke_sync_tennis() is a no-op.

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

comment on function public.invoke_sync_tennis() is
  'pg_cron target: POST sync-tennis using Vault project_url + ingest_secret. No RapidAPI key here.';

revoke all on function public.invoke_sync_tennis() from public, anon, authenticated;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'sync-tennis-30m';

select cron.schedule(
  'sync-tennis-30m',
  '*/30 * * * *',
  $$select public.invoke_sync_tennis();$$
);
