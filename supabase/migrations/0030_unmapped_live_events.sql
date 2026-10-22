-- 0030_unmapped_live_events.sql
-- Raw live rows that did not map to one match.
-- No match_id: an unknown event is not attached to a nearest match.

create table public.unmapped_live_events (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  reason text not null check (length(btrim(reason)) > 0),
  provider_event_id text,
  tour text check (tour is null or tour in ('atp', 'wta')),
  payload jsonb not null
);

create index unmapped_live_events_created_idx
  on public.unmapped_live_events (created_at desc);

comment on table public.unmapped_live_events is
  'Archived raw live payload that did not map. Not a live score and not a settlement.';

alter table public.unmapped_live_events enable row level security;

create policy unmapped_live_events_select_auth
  on public.unmapped_live_events
  for select
  to authenticated
  using (true);

revoke all on table public.unmapped_live_events from public, anon, authenticated;
grant select on table public.unmapped_live_events to authenticated;
grant select, insert on table public.unmapped_live_events to service_role;
