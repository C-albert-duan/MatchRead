-- 0010_provider_refs.sql
-- RapidAPI / provider identity for reconcile → ingest (Plan 16).
-- Idempotent. Does not seed fictional uso-2026 with real player ids.

-- Tournament ↔ RapidAPI season/tournament id (string for flexibility)
alter table public.tournaments
  add column if not exists provider_tournament_id text;

create unique index if not exists tournaments_provider_tournament_id_uidx
  on public.tournaments (provider_tournament_id)
  where provider_tournament_id is not null;

comment on column public.tournaments.provider_tournament_id is
  'RapidAPI tournament/season id (e.g. 21346). Used by reconcile-results.';

-- Seat ↔ RapidAPI player id
alter table public.draw_seats
  add column if not exists provider_player_id text;

create unique index if not exists draw_seats_draw_provider_player_uidx
  on public.draw_seats (draw_id, provider_player_id)
  where provider_player_id is not null;

comment on column public.draw_seats.provider_player_id is
  'RapidAPI player id as text. Null for fictional / unmapped seats.';

-- Explicit fixture/match id → MatchRead match_key (fail closed without a row)
create table if not exists public.provider_match_map (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  provider_match_id text not null,
  match_key text not null,
  created_at timestamptz not null default now(),
  primary key (tournament_id, provider_match_id),
  unique (tournament_id, match_key)
);

create index if not exists provider_match_map_tournament_idx
  on public.provider_match_map (tournament_id);

comment on table public.provider_match_map is
  'Maps RapidAPI historical match id → MatchRead match_key (r0-m0). Reconcile skips unmapped matches.';

grant select on public.provider_match_map to anon, authenticated;
grant select, insert, update, delete on public.provider_match_map to authenticated;

alter table public.provider_match_map enable row level security;

drop policy if exists provider_match_map_select on public.provider_match_map;
create policy provider_match_map_select on public.provider_match_map
  for select to anon, authenticated using (true);

-- Writes via service role (ingest/reconcile) or founder SQL; no broad authenticated write policy.
