-- 0003_matches.sql
-- Tennis fact: one row per match (topology, schedule, result). No seed data.

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round int not null check (round >= 0),
  index_in_round int not null check (index_in_round >= 0),
  provider_match_id text,
  side_a_player_id uuid references public.players (id) on delete restrict,
  side_b_player_id uuid references public.players (id) on delete restrict,
  scheduled_at timestamptz,
  has_time boolean not null default false,
  winner_player_id uuid references public.players (id) on delete restrict,
  voided boolean not null default false,
  settled_at timestamptz,
  unique (tournament_id, round, index_in_round),
  check (not (voided and winner_player_id is not null)),
  check (
    winner_player_id is null
    or winner_player_id = side_a_player_id
    or winner_player_id = side_b_player_id
  ),
  check (not has_time or scheduled_at is not null)
);

comment on table public.matches is 'Tennis fact: bracket topology + schedule + winner. No fiction.';

create unique index matches_provider_match_id_uidx
  on public.matches (tournament_id, provider_match_id)
  where provider_match_id is not null;

create index matches_tournament_round_idx on public.matches (tournament_id, round);

-- Platform lock_at from earliest timed first-round ball.
create or replace function public.refresh_lock_at(p_tournament_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock timestamptz;
begin
  select min(m.scheduled_at)
    into v_lock
    from public.matches m
   where m.tournament_id = p_tournament_id
     and m.round = 0
     and m.has_time = true
     and m.scheduled_at is not null;

  update public.tournaments
     set lock_at = v_lock
   where id = p_tournament_id;

  return v_lock;
end;
$$;

revoke all on function public.refresh_lock_at(uuid) from public;
grant execute on function public.refresh_lock_at(uuid) to service_role;

alter table public.matches enable row level security;

create policy matches_select_all on public.matches for select using (true);

grant select on table public.matches to anon, authenticated;
revoke insert, update, delete on table public.matches from anon, authenticated;
