-- Stage telemetry: one row each time a user's My Tennis Stage changes state.
-- A counter only. It exists before the dramatic states ship, so the
-- per-user rate is measured from day one.
--
-- A user inserts and reads only their own rows. The founder dashboard reads
-- aggregates through stage_event_rates(), which returns no user id.

create table public.stage_events (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  state text not null
    check (state in ('morning', 'live', 'next', 'reckoning', 'urgent', 'cascade')),
  match_ref text,
  at timestamptz not null default now()
);

create index stage_events_user_at_idx on public.stage_events (user_id, at desc);
create index stage_events_at_idx on public.stage_events (at desc);

comment on table public.stage_events is
  'Stage state changes per user. Telemetry; not shown to other users.';

alter table public.stage_events enable row level security;

create policy stage_events_insert_own on public.stage_events
  for insert to authenticated with check (user_id = auth.uid());

create policy stage_events_select_own on public.stage_events
  for select to authenticated using (user_id = auth.uid());

grant select, insert on table public.stage_events to authenticated;
revoke update, delete, truncate on table public.stage_events from authenticated;
grant usage on sequence public.stage_events_id_seq to authenticated;
revoke all on table public.stage_events from anon;

-- Aggregates since p_since: total events, distinct users, and the busiest
-- single user-hour. No user id leaves this function.
create or replace function public.stage_event_rates(p_since timestamptz)
returns table (events bigint, users bigint, max_per_user_hour bigint)
language sql
stable
security definer
set search_path = public
as $$
  with hourly as (
    select user_id, date_trunc('hour', at) as hour, count(*) as n
      from public.stage_events
     where at >= p_since
     group by user_id, date_trunc('hour', at)
  )
  select
    (select count(*) from public.stage_events where at >= p_since),
    (select count(distinct user_id) from public.stage_events where at >= p_since),
    coalesce((select max(n) from hourly), 0);
$$;

revoke all on function public.stage_event_rates(timestamptz) from public, anon;
grant execute on function public.stage_event_rates(timestamptz) to authenticated;
