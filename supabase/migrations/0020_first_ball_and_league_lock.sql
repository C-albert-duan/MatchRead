-- 0020_first_ball_and_league_lock.sql
-- Platform lock_at = earliest timed main-draw first-round match (r0).
-- Commissioner lock is per league, not tournament-global.
-- Idempotent.

-- ---------------------------------------------------------------------------
-- Per-league draw lock
-- ---------------------------------------------------------------------------

create table if not exists public.league_draw_locks (
  league_id uuid not null references public.leagues (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  locked_at timestamptz not null default now(),
  locked_by uuid references auth.users (id) on delete set null,
  primary key (league_id, tournament_id)
);

comment on table public.league_draw_locks is
  'Commissioner early lock for one league on one tournament. Does not lock other leagues.';

alter table public.league_draw_locks enable row level security;

drop policy if exists league_draw_locks_select on public.league_draw_locks;
create policy league_draw_locks_select on public.league_draw_locks
  for select using (public.is_league_member(league_id));

create or replace function public.league_draw_is_locked(
  p_league_id uuid,
  p_tournament_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_draw_locks
    where league_id = p_league_id
      and tournament_id = p_tournament_id
  );
$$;

revoke all on function public.league_draw_is_locked(uuid, uuid) from public;
grant execute on function public.league_draw_is_locked(uuid, uuid)
  to authenticated, anon;

create or replace function public.picks_are_locked(
  p_league_id uuid,
  p_tournament_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tournament_is_locked(p_tournament_id)
      or public.league_draw_is_locked(p_league_id, p_tournament_id);
$$;

revoke all on function public.picks_are_locked(uuid, uuid) from public;
grant execute on function public.picks_are_locked(uuid, uuid)
  to authenticated, anon;

-- ---------------------------------------------------------------------------
-- First-ball lock_at from match_schedule (timed r0, else any timed match)
-- Date-only rows (has_time = false) never invent a kickoff.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_tournament_lock_from_schedule(
  p_tournament_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first timestamptz;
begin
  select min(s.scheduled_at) into v_first
  from public.match_schedule s
  where s.tournament_id = p_tournament_id
    and s.has_time is true
    and s.match_key like 'r0-%';

  if v_first is not null then
    update public.tournaments
    set lock_at = v_first
    where id = p_tournament_id;
  end if;

  return v_first;
end;
$$;

comment on function public.refresh_tournament_lock_from_schedule(uuid) is
  'Set lock_at to the earliest timed main-draw first-round start. No-op when no timed schedule exists.';

revoke all on function public.refresh_tournament_lock_from_schedule(uuid) from public;
grant execute on function public.refresh_tournament_lock_from_schedule(uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- Trigger + RLS: league lock is also authority
-- ---------------------------------------------------------------------------

create or replace function public.brackets_reject_if_locked()
returns trigger
language plpgsql
as $$
begin
  if public.picks_are_locked(new.league_id, new.tournament_id) then
    raise exception 'tournament locked';
  end if;
  return new;
end;
$$;

drop policy if exists brackets_insert_own on public.brackets;
create policy brackets_insert_own on public.brackets
  for insert with check (
    user_id = auth.uid()
    and public.is_league_member(league_id)
    and not public.picks_are_locked(league_id, tournament_id)
  );

drop policy if exists brackets_update_own on public.brackets;
create policy brackets_update_own on public.brackets
  for update using (
    user_id = auth.uid()
    and public.is_league_member(league_id)
    and not public.picks_are_locked(league_id, tournament_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_league_member(league_id)
    and not public.picks_are_locked(league_id, tournament_id)
  );

-- ---------------------------------------------------------------------------
-- save / submit honour league lock
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
  if public.picks_are_locked(p_league_id, p_tournament_id) then
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
  where not public.picks_are_locked(p_league_id, p_tournament_id)
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
  if public.picks_are_locked(p_league_id, p_tournament_id) then
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

-- ---------------------------------------------------------------------------
-- Commissioner lock writes league_draw_locks (not tournaments.admin_locked_at)
-- Unlock is refused once the platform first-ball lock has passed.
-- ---------------------------------------------------------------------------

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
  v_league_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_league_slug is null or length(trim(p_league_slug)) = 0 then
    raise exception 'league required';
  end if;

  select * into v_t from public.tournaments where ref = p_tournament_ref;
  if v_t.id is null then
    raise exception 'tournament not found';
  end if;

  select l.id into v_league_id
  from public.leagues l
  join public.league_members m on m.league_id = l.id
  where l.slug = trim(p_league_slug)
    and m.user_id = v_uid
    and m.role = 'commissioner'
    and (
      l.format = 'season'
      or l.tournament_label = v_t.name
    );

  if v_league_id is null then
    raise exception 'not commissioner';
  end if;

  if p_locked then
    insert into public.league_draw_locks (
      league_id, tournament_id, locked_at, locked_by
    )
    values (v_league_id, v_t.id, now(), v_uid)
    on conflict (league_id, tournament_id) do nothing;
  else
    if public.tournament_is_locked(v_t.id) then
      raise exception 'tournament locked';
    end if;
    delete from public.league_draw_locks
    where league_id = v_league_id
      and tournament_id = v_t.id;
  end if;

  return v_t;
end;
$$;

revoke all on function public.admin_lock_tournament(text, boolean, text) from public;
grant execute on function public.admin_lock_tournament(text, boolean, text) to authenticated;

-- Backfill lock_at from existing timed schedule (Montreal / Toronto).
do $$
declare
  r record;
begin
  for r in select id from public.tournaments loop
    perform public.refresh_tournament_lock_from_schedule(r.id);
  end loop;
end $$;
