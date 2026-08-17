-- 0021_announced_matchups.sql
-- Proven first-round pairs from Tennis API, even before the field is complete.
-- Users can see and pick these; missing qualifying slots are not invented.
-- Idempotent.

create table if not exists public.announced_matchups (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  provider_match_id text not null,
  match_key text not null,
  player1_ref text not null,
  player1_last_name text not null,
  player1_country text not null default 'XXX',
  player1_seed int,
  player2_ref text not null,
  player2_last_name text not null,
  player2_country text not null default 'XXX',
  player2_seed int,
  scheduled_at timestamptz,
  has_time boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tournament_id, provider_match_id),
  unique (tournament_id, match_key)
);

create index if not exists announced_matchups_tournament_idx
  on public.announced_matchups (tournament_id);

comment on table public.announced_matchups is
  'Named main-draw first-round pairs from the provider. Partial fields are allowed; do not pad.';

grant select on public.announced_matchups to anon, authenticated;

alter table public.announced_matchups enable row level security;

drop policy if exists announced_matchups_select on public.announced_matchups;
create policy announced_matchups_select on public.announced_matchups
  for select to anon, authenticated using (true);
