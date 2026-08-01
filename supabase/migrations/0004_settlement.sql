-- 0004_settlement.sql
-- Phase 4: official results, bracket snapshots, season standings, void stub.
-- Idempotent: safe to re-run. Fixture results are inserted only when missing
-- (never deletes commissioner-entered results).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.match_results (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  match_key text not null,
  winner_ref text,
  voided boolean not null default false,
  settled_at timestamptz not null default now(),
  primary key (tournament_id, match_key),
  constraint match_results_winner_or_void check (
    voided = true or winner_ref is not null
  )
);

create table if not exists public.bracket_snapshots (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  bracket_id uuid references public.brackets (id) on delete set null,
  score int not null default 0,
  correct int not null default 0,
  incorrect int not null default 0,
  voided_picks int not null default 0,
  upside int not null default 0,
  max_score int not null default 0,
  champion_ref text,
  champion_alive boolean,
  position int,
  previous_position int,
  score_delta int,
  position_delta int,
  ranked_at timestamptz not null default now(),
  unique (league_id, tournament_id, user_id)
);

create index if not exists bracket_snapshots_league_tournament_idx
  on public.bracket_snapshots (league_id, tournament_id, position);

create table if not exists public.season_standings (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  points int not null default 0,
  position int,
  previous_position int,
  points_delta int,
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

-- Operator void stub: mark a published seat's later matches void-eligible.
-- Full disruption UI is Phase 7; this table records intent.
create table if not exists public.pick_voids (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  player_ref text not null,
  from_round int not null default 0,
  reason text not null default 'withdrawal',
  created_at timestamptz not null default now(),
  unique (tournament_id, player_ref, from_round)
);

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------

grant select on public.match_results to authenticated, anon;
grant select, insert, update, delete on public.match_results to authenticated;

grant select on public.bracket_snapshots to authenticated;
grant select, insert, update, delete on public.bracket_snapshots to authenticated;

grant select on public.season_standings to authenticated;
grant select, insert, update, delete on public.season_standings to authenticated;

grant select on public.pick_voids to authenticated;
grant select, insert on public.pick_voids to authenticated;

alter table public.match_results enable row level security;
alter table public.bracket_snapshots enable row level security;
alter table public.season_standings enable row level security;
alter table public.pick_voids enable row level security;

drop policy if exists match_results_select on public.match_results;
create policy match_results_select on public.match_results
  for select using (true);

-- Writes go through security-definer RPC / service; commissioners can upsert for fixture.
drop policy if exists match_results_commissioner_write on public.match_results;
create policy match_results_commissioner_write on public.match_results
  for all using (
    exists (
      select 1
      from public.tournaments t
      join public.leagues l on l.tournament_label = t.name
      join public.league_members m on m.league_id = l.id
      where t.id = match_results.tournament_id
        and m.user_id = auth.uid()
        and m.role = 'commissioner'
    )
  )
  with check (
    exists (
      select 1
      from public.tournaments t
      join public.leagues l on l.tournament_label = t.name
      join public.league_members m on m.league_id = l.id
      where t.id = match_results.tournament_id
        and m.user_id = auth.uid()
        and m.role = 'commissioner'
    )
  );

drop policy if exists snapshots_select_members on public.bracket_snapshots;
create policy snapshots_select_members on public.bracket_snapshots
  for select using (public.is_league_member(league_id));

drop policy if exists snapshots_write_members on public.bracket_snapshots;
create policy snapshots_write_members on public.bracket_snapshots
  for all using (public.is_league_member(league_id))
  with check (public.is_league_member(league_id));

drop policy if exists season_select_members on public.season_standings;
create policy season_select_members on public.season_standings
  for select using (public.is_league_member(league_id));

drop policy if exists season_write_members on public.season_standings;
create policy season_write_members on public.season_standings
  for all using (public.is_league_member(league_id))
  with check (public.is_league_member(league_id));

drop policy if exists pick_voids_select on public.pick_voids;
create policy pick_voids_select on public.pick_voids
  for select using (true);

drop policy if exists pick_voids_commissioner on public.pick_voids;
create policy pick_voids_commissioner on public.pick_voids
  for insert with check (
    exists (
      select 1
      from public.tournaments t
      join public.leagues l on l.tournament_label = t.name
      join public.league_members m on m.league_id = l.id
      where t.id = pick_voids.tournament_id
        and m.user_id = auth.uid()
        and m.role = 'commissioner'
    )
  );

-- ---------------------------------------------------------------------------
-- Fixture: seed a complete official result path for uso-2026 (deterministic)
-- Only fills keys that do not already exist — never overwrites live edits.
-- ---------------------------------------------------------------------------

insert into public.match_results (tournament_id, match_key, winner_ref, voided)
select t.id, v.match_key, v.winner_ref, false
from public.tournaments t
cross join (
  values
    -- Round of 16 (favorites / even indices for unseeded pairs)
    ('r0-m0',  'p-0'),   -- Aldecoa over Brennig
    ('r0-m1',  'p-2'),   -- Castellan over Duvernay
    ('r0-m2',  'p-4'),   -- Erlandsen over Falkner
    ('r0-m3',  'p-6'),   -- Gadea over Halvorsen
    ('r0-m4',  'p-8'),   -- Ivarsson over Jelinek
    ('r0-m5',  'p-10'),  -- Kaltenbach over Lindqvist
    ('r0-m6',  'p-12'),  -- Marchetti over Norrbom
    ('r0-m7',  'p-14'),  -- Okonjo over Pellerin
    -- Quarters
    ('r1-m0',  'p-0'),
    ('r1-m1',  'p-4'),
    ('r1-m2',  'p-8'),
    ('r1-m3',  'p-14'),
    -- Semis
    ('r2-m0',  'p-0'),
    ('r2-m1',  'p-14'),
    -- Final
    ('r3-m0',  'p-0')
) as v(match_key, winner_ref)
where t.ref = 'uso-2026'
on conflict (tournament_id, match_key) do nothing;
