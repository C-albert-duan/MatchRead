-- 0036_live_terminal_sweep.sql
-- Terminal live rows expire after 24 hours.
-- The existing sync-facts cron calls this. There is no new job.

create or replace function public.sweep_terminal_live_state()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  delete from public.live_match_state
   where phase = 'provisional_final'
     and updated_at < now() - interval '24 hours';
  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.sweep_terminal_live_state() is
  'Deletes provisional_final live rows older than 24 hours. Does not update matches. in_play and suspended stay.';

revoke all on function public.sweep_terminal_live_state() from public, anon, authenticated;
grant execute on function public.sweep_terminal_live_state() to service_role;

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
  perform public.sweep_terminal_live_state();

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
  'pg_cron: sweep terminal live rows, then POST sync-facts. No separate live scheduler.';

revoke all on function public.invoke_sync_facts() from public, anon, authenticated;
