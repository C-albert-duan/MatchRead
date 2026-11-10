-- 0047_lock_down_service_rpcs_and_ops_events.sql
--
-- Fix list P0-1 and P0-2 (check/CODEBASE-FIX-LIST.md).
--
-- P0-1. claim_settlement, unwind_settlement_parent and refresh_lock_at were
-- revoked from PUBLIC only. Supabase grants EXECUTE to anon and
-- authenticated directly, so both browser roles could still call them.
-- Only the Edge functions (service role) call these.
--
-- P0-2. ops_events let every signed-in user read every row and let anyone
-- insert any row, including the names the founder integrity page reads.
-- Now:
--   * reads: founders only, through public.founders + public.is_founder().
--     The web tier holds only the anon key, so the gate has to live here.
--   * browser / web-tier writes: public.log_client_event(), which accepts
--     kind 'error' or 'event' only, refuses the pipeline's integrity names,
--     caps the payload, and stamps origin = 'client' and the caller's uid.
--   * pipeline writes: unchanged (service role bypasses RLS).
--
-- After deploy, add founders once (SQL editor, service role):
--   insert into public.founders (user_id)
--   select id from auth.users where lower(email) in ('<founder email>')
--   on conflict do nothing;
-- Until then the founder ops tiles read empty (fail closed).

-- ---------------------------------------------------------------------------
-- P0-1: service-only RPCs
-- ---------------------------------------------------------------------------
revoke all on function public.claim_settlement(uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.unwind_settlement_parent(uuid)
  from public, anon, authenticated;
revoke all on function public.refresh_lock_at(uuid)
  from public, anon, authenticated;

grant execute on function public.claim_settlement(uuid, text, uuid, uuid) to service_role;
grant execute on function public.unwind_settlement_parent(uuid) to service_role;
grant execute on function public.refresh_lock_at(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- P0-2: founders gate
-- ---------------------------------------------------------------------------
create table if not exists public.founders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz not null default now()
);

comment on table public.founders is
  'Users allowed to read founder ops data. Service role writes only.';

alter table public.founders enable row level security;
revoke all on table public.founders from public, anon, authenticated;
grant all on table public.founders to service_role;

create or replace function public.is_founder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.founders f where f.user_id = auth.uid()
  );
$$;

revoke all on function public.is_founder() from public, anon;
grant execute on function public.is_founder() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- P0-2: ops_events
-- ---------------------------------------------------------------------------
drop policy if exists ops_events_select_auth on public.ops_events;
drop policy if exists ops_events_select on public.ops_events;
drop policy if exists ops_events_insert on public.ops_events;

revoke all on table public.ops_events from public, anon, authenticated;
grant select on table public.ops_events to authenticated;
grant all on table public.ops_events to service_role;

create policy ops_events_select_founder on public.ops_events
  for select to authenticated using (public.is_founder());

create or replace function public.log_client_event(
  p_kind text,
  p_name text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 80);
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
begin
  if p_kind not in ('error', 'event') then
    raise exception 'invalid kind' using errcode = '22023', detail = 'invalid_kind';
  end if;
  if v_name = '' then
    raise exception 'name required' using errcode = '22023', detail = 'invalid_name';
  end if;
  -- Names the pipeline writes and the founder integrity page reads.
  if v_name in (
    'publish_blocked', 'terminal_without_winner', 'tier_unmapped',
    'draw_identity_reject', 'ingestion_gap', 'unexplained_absence',
    'listener_overlap', 'live_rest_disagreement', 'unmapped_event',
    'winner_conflict'
  ) then
    raise exception 'reserved name' using errcode = '42501', detail = 'reserved_name';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'payload must be an object' using errcode = '22023', detail = 'invalid_payload';
  end if;
  if octet_length(v_payload::text) > 4096 then
    raise exception 'payload too large' using errcode = '22023', detail = 'payload_too_large';
  end if;

  insert into public.ops_events (kind, name, payload)
  values (
    p_kind,
    v_name,
    v_payload || jsonb_build_object('origin', 'client', 'uid', auth.uid())
  );
end;
$$;

comment on function public.log_client_event(text, text, jsonb) is
  'Browser and web-tier telemetry sink. Cannot write pipeline integrity names.';

revoke all on function public.log_client_event(text, text, jsonb) from public;
grant execute on function public.log_client_event(text, text, jsonb)
  to anon, authenticated, service_role;
