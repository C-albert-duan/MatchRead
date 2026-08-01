-- 0003_brackets.sql
-- Phase 3: tournaments, draws, seats, member brackets, lock-aware save/submit.
-- Fresh install: run after 0001_init.sql and 0002_leagues.sql.
-- Idempotent: safe to re-run. Fixture seed does not wipe existing seats/results.
-- Includes final save_bracket_picks (confidence) + admin_lock (season) so a
-- re-run of this file cannot undo 0006 / 0007.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  ref text not null unique,
  name text not null unique,
  surface text not null default 'hard'
    check (surface in ('hard', 'clay', 'grass', 'indoor', 'carpet')),
  starts_on date,
  lock_at timestamptz,
  admin_locked_at timestamptz,
  draw_size int not null check (draw_size >= 2 and (draw_size & (draw_size - 1)) = 0),
  venue_tz text not null default 'America/New_York',
  created_at timestamptz not null default now()
);

create table if not exists public.draws (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null unique references public.tournaments (id) on delete cascade,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.draw_seats (
  draw_id uuid not null references public.draws (id) on delete cascade,
  position int not null check (position >= 0),
  player_ref text not null,
  last_name text not null,
  seed int,
  country_code text not null default 'XXX',
  is_bye boolean not null default false,
  primary key (draw_id, position),
  unique (draw_id, player_ref)
);

create index if not exists draw_seats_draw_id_idx on public.draw_seats (draw_id);

create table if not exists public.brackets (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  picks jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (league_id, tournament_id, user_id)
);

create index if not exists brackets_league_tournament_idx
  on public.brackets (league_id, tournament_id);

-- Confidence map (also ensured in 0006; here so re-run of 0003 keeps Tier 1)
alter table public.brackets
  add column if not exists confidence jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

grant select on public.tournaments to anon, authenticated;
grant select on public.draws to anon, authenticated;
grant select on public.draw_seats to anon, authenticated;
grant select, insert, update on public.brackets to authenticated;

-- ---------------------------------------------------------------------------
-- Lock helper
-- ---------------------------------------------------------------------------

create or replace function public.tournament_is_locked(p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tournaments t
    where t.id = p_tournament_id
      and (
        t.admin_locked_at is not null
        or (t.lock_at is not null and t.lock_at <= now())
      )
  );
$$;

revoke all on function public.tournament_is_locked(uuid) from public;
grant execute on function public.tournament_is_locked(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tournaments enable row level security;
alter table public.draws enable row level security;
alter table public.draw_seats enable row level security;
alter table public.brackets enable row level security;

drop policy if exists tournaments_select_all on public.tournaments;
create policy tournaments_select_all on public.tournaments
  for select using (true);

drop policy if exists draws_select_all on public.draws;
create policy draws_select_all on public.draws
  for select using (true);

drop policy if exists draw_seats_select_all on public.draw_seats;
create policy draw_seats_select_all on public.draw_seats
  for select using (true);

drop policy if exists brackets_select_own on public.brackets;
create policy brackets_select_own on public.brackets
  for select using (
    user_id = auth.uid()
    and public.is_league_member(league_id)
  );

drop policy if exists brackets_insert_own on public.brackets;
create policy brackets_insert_own on public.brackets
  for insert with check (
    user_id = auth.uid()
    and public.is_league_member(league_id)
    and not public.tournament_is_locked(tournament_id)
  );

drop policy if exists brackets_update_own on public.brackets;
create policy brackets_update_own on public.brackets
  for update using (
    user_id = auth.uid()
    and public.is_league_member(league_id)
    and not public.tournament_is_locked(tournament_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_league_member(league_id)
    and not public.tournament_is_locked(tournament_id)
  );

-- ---------------------------------------------------------------------------
-- RPCs: save / submit / admin lock (commissioner fixture control)
-- ---------------------------------------------------------------------------

drop function if exists public.save_bracket_picks(uuid, uuid, jsonb);
drop function if exists public.save_bracket_picks(uuid, uuid, jsonb, jsonb);

create or replace function public.save_bracket_picks(
  p_league_id uuid,
  p_tournament_id uuid,
  p_picks jsonb,
  p_confidence jsonb default null
)
returns public.brackets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.brackets;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'not a member';
  end if;
  if public.tournament_is_locked(p_tournament_id) then
    raise exception 'tournament locked';
  end if;
  if p_picks is null or jsonb_typeof(p_picks) <> 'object' then
    raise exception 'invalid picks';
  end if;
  if p_confidence is not null and jsonb_typeof(p_confidence) <> 'object' then
    raise exception 'invalid confidence';
  end if;

  insert into public.brackets as b (
    league_id,
    tournament_id,
    user_id,
    picks,
    confidence,
    updated_at
  )
  values (
    p_league_id,
    p_tournament_id,
    v_uid,
    p_picks,
    coalesce(p_confidence, '{}'::jsonb),
    now()
  )
  on conflict (league_id, tournament_id, user_id)
  do update set
    picks = excluded.picks,
    confidence = case
      when p_confidence is null then b.confidence
      else excluded.confidence
    end,
    updated_at = now()
  where not public.tournament_is_locked(p_tournament_id)
  returning * into v_row;

  if v_row.id is null then
    raise exception 'tournament locked';
  end if;

  return v_row;
end;
$$;

revoke all on function public.save_bracket_picks(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.save_bracket_picks(uuid, uuid, jsonb, jsonb) to authenticated;

drop function if exists public.submit_bracket(uuid, uuid);
create or replace function public.submit_bracket(
  p_league_id uuid,
  p_tournament_id uuid
)
returns public.brackets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.brackets;
  v_draw_size int;
  v_need int;
  v_have int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'not a member';
  end if;
  if public.tournament_is_locked(p_tournament_id) then
    raise exception 'tournament locked';
  end if;

  select t.draw_size into v_draw_size
  from public.tournaments t
  where t.id = p_tournament_id;

  if v_draw_size is null then
    raise exception 'tournament not found';
  end if;

  v_need := v_draw_size - 1;

  select * into v_row
  from public.brackets b
  where b.league_id = p_league_id
    and b.tournament_id = p_tournament_id
    and b.user_id = v_uid;

  if v_row.id is null then
    raise exception 'bracket incomplete';
  end if;

  select count(*)::int into v_have
  from jsonb_object_keys(v_row.picks);

  if v_have < v_need then
    raise exception 'bracket incomplete';
  end if;

  update public.brackets
  set submitted_at = coalesce(submitted_at, now()),
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.submit_bracket(uuid, uuid) from public;
grant execute on function public.submit_bracket(uuid, uuid) to authenticated;

-- Final lock RPC (same body as 0007) — season + single commissioners.
drop function if exists public.admin_lock_tournament(text, boolean);
drop function if exists public.admin_lock_tournament(text, boolean, text);

create or replace function public.admin_lock_tournament(
  p_tournament_ref text,
  p_locked boolean,
  p_league_slug text default null
)
returns public.tournaments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tournaments;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_t from public.tournaments where ref = p_tournament_ref;
  if v_t.id is null then
    raise exception 'tournament not found';
  end if;

  if p_league_slug is not null and length(trim(p_league_slug)) > 0 then
    if not exists (
      select 1
      from public.leagues l
      join public.league_members m on m.league_id = l.id
      where l.slug = trim(p_league_slug)
        and m.user_id = v_uid
        and m.role = 'commissioner'
        and (
          l.format = 'season'
          or l.tournament_label = v_t.name
        )
    ) then
      raise exception 'not commissioner';
    end if;
  else
    if not exists (
      select 1
      from public.leagues l
      join public.league_members m on m.league_id = l.id
      where m.user_id = v_uid
        and m.role = 'commissioner'
        and (
          l.tournament_label = v_t.name
          or l.format = 'season'
        )
    ) then
      raise exception 'not commissioner';
    end if;
  end if;

  update public.tournaments
  set admin_locked_at = case when p_locked then coalesce(admin_locked_at, now()) else null end
  where id = v_t.id
  returning * into v_t;

  return v_t;
end;
$$;

revoke all on function public.admin_lock_tournament(text, boolean, text) from public;
grant execute on function public.admin_lock_tournament(text, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixture seed: US Open 2026 (16-draw for early UX) + Wimbledon (no draw yet)
-- ---------------------------------------------------------------------------

insert into public.tournaments (ref, name, surface, starts_on, lock_at, draw_size, venue_tz)
values
  (
    'uso-2026',
    'US Open 2026',
    'hard',
    '2026-08-31',
    '2026-08-30 15:00:00+00',
    16,
    'America/New_York'
  ),
  (
    'wim-2026',
    'Wimbledon 2026',
    'grass',
    '2026-06-29',
    '2026-06-28 11:00:00+00',
    16,
    'Europe/London'
  ),
  (
    'rg-2026',
    'Roland Garros 2026',
    'clay',
    '2026-05-24',
    '2026-05-24 10:00:00+00',
    16,
    'Europe/Paris'
  )
on conflict (ref) do update set
  name = excluded.name,
  surface = excluded.surface,
  starts_on = excluded.starts_on,
  lock_at = excluded.lock_at,
  draw_size = excluded.draw_size,
  venue_tz = excluded.venue_tz;

-- Publish fixture draw for US Open only (Wimbledon / RG stay draw-pending)
insert into public.draws (tournament_id)
select t.id from public.tournaments t where t.ref = 'uso-2026'
on conflict (tournament_id) do nothing;

-- Seed seats only when the fixture draw has none (never wipe existing seats).
insert into public.draw_seats (draw_id, position, player_ref, last_name, seed, country_code, is_bye)
select d.id, v.position, v.player_ref, v.last_name, v.seed, v.country_code, false
from public.draws d
join public.tournaments t on t.id = d.tournament_id
cross join (
  values
    (0,  'p-0',  'Aldecoa',     1,  'ESP'),
    (1,  'p-1',  'Brennig',     null, 'GBR'),
    (2,  'p-2',  'Castellan',   8,  'ITA'),
    (3,  'p-3',  'Duvernay',    null, 'FRA'),
    (4,  'p-4',  'Erlandsen',   4,  'NOR'),
    (5,  'p-5',  'Falkner',     null, 'GER'),
    (6,  'p-6',  'Gadea',       5,  'ESP'),
    (7,  'p-7',  'Halvorsen',   null, 'SWE'),
    (8,  'p-8',  'Ivarsson',    3,  'SWE'),
    (9,  'p-9',  'Jelinek',     null, 'CZE'),
    (10, 'p-10', 'Kaltenbach',  6,  'GER'),
    (11, 'p-11', 'Lindqvist',   null, 'SWE'),
    (12, 'p-12', 'Marchetti',   7,  'ITA'),
    (13, 'p-13', 'Norrbom',     null, 'SWE'),
    (14, 'p-14', 'Okonjo',      2,  'NGA'),
    (15, 'p-15', 'Pellerin',    null, 'FRA')
) as v(position, player_ref, last_name, seed, country_code)
where t.ref = 'uso-2026'
  and not exists (
    select 1 from public.draw_seats ds where ds.draw_id = d.id
  );
