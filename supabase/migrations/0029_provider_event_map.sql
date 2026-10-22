-- 0029_provider_event_map.sql
-- (tour, live-list id) → internal match.
-- The live-list id is not a REST fixture id. No socket event id was captured.
-- 0028's read view used this name. The table replaces that view.

drop view if exists public.provider_event_map;

create table public.provider_event_map (
  tour text not null check (tour in ('atp', 'wta')),
  provider_event_id text not null check (length(btrim(provider_event_id)) > 0),
  match_id uuid not null references public.matches (id) on delete cascade,
  mapped_at timestamptz not null default now(),
  primary key (tour, provider_event_id)
);

create index provider_event_map_match_id_idx
  on public.provider_event_map (match_id);

comment on table public.provider_event_map is
  'Live-list id plus tourType (atp or wta) for one internal match. Not a fixture id and not a socket id.';
comment on column public.provider_event_map.provider_event_id is
  'results[].id from the live list. Not fixture data[].id and not a captured socket event id.';
comment on column public.provider_event_map.match_id is
  'Internal matches.id. Not granted to anon or authenticated.';

alter table public.provider_event_map enable row level security;

create policy provider_event_map_select_auth
  on public.provider_event_map
  for select
  to authenticated
  using (true);

revoke all on table public.provider_event_map from public, anon, authenticated;
grant select (tour, provider_event_id, mapped_at)
  on public.provider_event_map to authenticated;
grant select, insert, update, delete
  on table public.provider_event_map to service_role;
