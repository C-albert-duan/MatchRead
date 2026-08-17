-- 0005_brackets_picks.sql
-- Product: entries + choices; score columns on brackets; season view. No seed data.

create table public.brackets (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  submitted_at timestamptz,
  points int,
  rank int,
  champion_player_id uuid references public.players (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (league_id, tournament_id, user_id),
  foreign key (league_id, tournament_id)
    references public.league_tournaments (league_id, tournament_id)
    on delete cascade
);

comment on table public.brackets is 'Product: one entry per user × league × tournament; points/rank after settle.';

create table public.picks (
  bracket_id uuid not null references public.brackets (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete restrict,
  confidence int check (confidence is null or confidence > 0),
  updated_at timestamptz not null default now(),
  primary key (bracket_id, match_id)
);

comment on table public.picks is 'Product: chosen winner per match inside a bracket.';

create index brackets_league_id_idx on public.brackets (league_id);
create index brackets_tournament_id_idx on public.brackets (tournament_id);
create index picks_match_id_idx on public.picks (match_id);

create or replace view public.season_points
with (security_invoker = true)
as
select
  b.league_id,
  b.user_id,
  coalesce(sum(b.points), 0)::int as points,
  count(*) filter (where b.points is not null)::int as events_scored
from public.brackets b
join public.leagues l on l.id = b.league_id
where l.format = 'season'
group by b.league_id, b.user_id;

comment on view public.season_points is 'Derived: sum of bracket points for season leagues.';

alter table public.brackets enable row level security;
alter table public.picks enable row level security;

create policy brackets_select_member on public.brackets
  for select using (public.is_league_member(league_id));

create policy picks_select_member on public.picks
  for select using (
    exists (
      select 1 from public.brackets b
       where b.id = picks.bracket_id
         and public.is_league_member(b.league_id)
    )
  );

grant select on table public.brackets to authenticated;
grant select on table public.picks to authenticated;
grant select on public.season_points to authenticated;

revoke all on table public.brackets from anon;
revoke all on table public.picks from anon;
revoke all on public.season_points from anon;
