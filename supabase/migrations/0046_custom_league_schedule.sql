-- Custom league schedules (MatchRead Custom League Schedules engineering
-- guide, adapted to per-league brackets).
--
-- A season league covers every tournament (apps/web lib/leagues/covers.ts).
-- schedule_mode = 'custom' is an opt-in: the commissioner switches once, and
-- from then on the league covers only its league_tournaments rows. Existing
-- leagues stay 'all' and behave exactly as before. Brackets stay per league.
--
-- Additive only. Nothing here writes to tournaments, matches, brackets or
-- picks, and no row of another league is touched.
--
-- Errors carry SQLSTATE plus a stable DETAIL code; the web maps DETAIL, never
-- the message. Messages from 0042 are kept so suite 47 still holds.

alter table public.leagues
  add column if not exists schedule_mode text not null default 'all';

alter table public.leagues
  drop constraint if exists leagues_schedule_mode_check;
alter table public.leagues
  add constraint leagues_schedule_mode_check check (
    schedule_mode in ('all', 'custom')
    and (schedule_mode = 'all' or format = 'season')
  );

comment on column public.leagues.schedule_mode is
  'all = a season league covers every tournament. custom = only its league_tournaments rows.';

-- One eligibility rule for the picker, the opt-in seed and Add.
create or replace function public.tournament_schedulable(p_league_id uuid, p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tournaments t
     where t.id = p_tournament_id
       and t.bracket_eligible
       and t.slug not like 'e2e-%'
       and (t.ends_on is null or t.ends_on >= current_date)
  )
  and not public.picks_are_locked(p_league_id, p_tournament_id);
$$;

comment on function public.tournament_schedulable(uuid, uuid) is
  'Bracket-eligible, not finished, picks not locked for this league.';

-- Locks the league row first so two commissioner sessions serialise, then
-- checks the caller under that lock. A non-commissioner gets 42501 whether
-- or not the league exists.
create or replace function public.assert_schedule_editable(p_league_id uuid)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues;
begin
  select * into v_league from public.leagues where id = p_league_id for update;
  if not found or not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner'
      using errcode = '42501', detail = 'unauthorized';
  end if;
  return v_league;
end;
$$;

-- Return types change (row/void -> jsonb), so drop before recreating.
drop function if exists public.add_league_tournament(uuid, uuid);
drop function if exists public.remove_league_tournament(uuid, uuid);

create function public.add_league_tournament(p_league_id uuid, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues;
begin
  v_league := public.assert_schedule_editable(p_league_id);

  if v_league.format <> 'season' then
    raise exception 'single tournament league'
      using errcode = 'P0001', detail = 'single_tournament_league';
  end if;
  if v_league.schedule_mode <> 'custom' then
    raise exception 'schedule not custom'
      using errcode = 'P0001', detail = 'schedule_not_custom';
  end if;

  if exists (
    select 1 from public.league_tournaments
     where league_id = p_league_id and tournament_id = p_tournament_id
  ) then
    return '{"status":"already_added"}'::jsonb;
  end if;

  if not exists (select 1 from public.tournaments where id = p_tournament_id) then
    raise exception 'tournament not found'
      using errcode = 'P0002', detail = 'not_found';
  end if;
  if public.picks_are_locked(p_league_id, p_tournament_id) then
    raise exception 'tournament locked'
      using errcode = 'P0001', detail = 'tournament_locked';
  end if;
  if not public.tournament_schedulable(p_league_id, p_tournament_id) then
    raise exception 'tournament not schedulable'
      using errcode = 'P0001', detail = 'tournament_ineligible';
  end if;

  insert into public.league_tournaments (league_id, tournament_id)
  values (p_league_id, p_tournament_id)
  on conflict (league_id, tournament_id) do nothing;

  return '{"status":"added"}'::jsonb;
end;
$$;

comment on function public.add_league_tournament(uuid, uuid) is
  'Commissioner only, custom season leagues. Idempotent: a repeat returns already_added.';

-- 0042's rules, same order and messages, now returning a status.
create function public.remove_league_tournament(p_league_id uuid, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform public.assert_schedule_editable(p_league_id);

  if not exists (
    select 1 from public.league_tournaments
     where league_id = p_league_id and tournament_id = p_tournament_id
  ) then
    return '{"status":"not_on_schedule"}'::jsonb;
  end if;

  if public.picks_are_locked(p_league_id, p_tournament_id) then
    raise exception 'tournament locked'
      using errcode = 'P0001', detail = 'tournament_locked';
  end if;

  if exists (
    select 1 from public.brackets
     where league_id = p_league_id and tournament_id = p_tournament_id
  ) then
    raise exception 'league tournament has brackets'
      using errcode = 'P0001', detail = 'brackets_exist';
  end if;

  select count(*) into v_count
    from public.league_tournaments
   where league_id = p_league_id;
  if v_count <= 1 then
    raise exception 'last tournament'
      using errcode = 'P0001', detail = 'last_tournament';
  end if;

  delete from public.league_tournaments
   where league_id = p_league_id and tournament_id = p_tournament_id;

  return '{"status":"removed"}'::jsonb;
end;
$$;

comment on function public.remove_league_tournament(uuid, uuid) is
  'Commissioner only. Refuses when locked, when brackets exist, or for the last event. Absent returns not_on_schedule.';

-- The opt-in. Keeps every row the league already has (each one a bracket
-- may hang from) and adds every event members could still enter today, so
-- the switch changes nothing a member sees until the commissioner edits.
create or replace function public.enable_custom_schedule(p_league_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues;
begin
  v_league := public.assert_schedule_editable(p_league_id);

  if v_league.format <> 'season' then
    raise exception 'single tournament league'
      using errcode = 'P0001', detail = 'single_tournament_league';
  end if;
  if v_league.schedule_mode = 'custom' then
    return '{"status":"already_custom"}'::jsonb;
  end if;

  insert into public.league_tournaments (league_id, tournament_id)
  select p_league_id, t.id
    from public.tournaments t
   where public.tournament_schedulable(p_league_id, t.id)
  on conflict (league_id, tournament_id) do nothing;

  update public.leagues set schedule_mode = 'custom' where id = p_league_id;

  return '{"status":"custom"}'::jsonb;
end;
$$;

comment on function public.enable_custom_schedule(uuid) is
  'Commissioner only. One-way switch of a season league to a custom schedule; seeds open events.';

-- Read-only picker rows: what Add would accept right now.
create or replace function public.league_schedule_candidates(p_league_id uuid)
returns table (
  tournament_id uuid,
  slug text,
  name text,
  tour text,
  tier text,
  surface text,
  starts_on date,
  ends_on date,
  lock_at timestamptz,
  venue_tz text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner'
      using errcode = '42501', detail = 'unauthorized';
  end if;

  return query
  select t.id, t.slug, t.name, t.tour, t.tier, t.surface,
         t.starts_on, t.ends_on, t.lock_at, t.venue_tz
    from public.tournaments t
   where public.tournament_schedulable(p_league_id, t.id)
     and not exists (
       select 1 from public.league_tournaments lt
        where lt.league_id = p_league_id and lt.tournament_id = t.id
     )
   order by t.starts_on nulls last, t.name;
end;
$$;

comment on function public.league_schedule_candidates(uuid) is
  'Commissioner only. Eligible events not yet on this league''s schedule.';

-- A custom league refuses an unscheduled tournament on save, like a single
-- league. Body is 0043's with that one condition widened.
create or replace function public.save_picks(
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
  v_bracket public.brackets;
  v_item jsonb;
  v_match_id uuid;
  v_player_id uuid;
  v_conf int;
  v_format text;
  v_mode text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member';
  end if;
  if public.picks_are_locked(p_league_id, p_tournament_id) then
    raise exception 'tournament locked';
  end if;

  if not exists (
    select 1 from public.league_tournaments
     where league_id = p_league_id and tournament_id = p_tournament_id
  ) then
    select format, schedule_mode into v_format, v_mode
      from public.leagues where id = p_league_id;
    if v_format is distinct from 'season' or v_mode = 'custom' then
      raise exception 'League does not include this tournament';
    end if;
    insert into public.league_tournaments (league_id, tournament_id)
    values (p_league_id, p_tournament_id)
    on conflict (league_id, tournament_id) do nothing;
  end if;

  insert into public.brackets (league_id, tournament_id, user_id, updated_at)
  values (p_league_id, p_tournament_id, auth.uid(), now())
  on conflict (league_id, tournament_id, user_id) do update
    set updated_at = now()
  returning * into v_bracket;

  if v_bracket.submitted_at is not null
     and public.picks_are_locked(p_league_id, p_tournament_id) then
    raise exception 'tournament locked';
  end if;

  -- p_picks: array of { "match_id": "...", "player_id": "..." }
  for v_item in select * from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb))
  loop
    v_match_id := (v_item->>'match_id')::uuid;
    v_player_id := (v_item->>'player_id')::uuid;
    v_conf := null;
    if p_confidence is not null and p_confidence ? (v_match_id::text) then
      v_conf := (p_confidence->>v_match_id::text)::int;
    end if;

    insert into public.picks (bracket_id, match_id, player_id, confidence, updated_at)
    values (v_bracket.id, v_match_id, v_player_id, v_conf, now())
    on conflict (bracket_id, match_id) do update
      set player_id = excluded.player_id,
          confidence = excluded.confidence,
          updated_at = now();
  end loop;

  return v_bracket;
end;
$$;

-- brackets cascade from league_tournaments, so a stray delete would erase
-- members' picks and settled points. Refuse any delete that a function
-- forgot to guard. Deleting the league itself still cascades: the RI action
-- runs after the league row is gone. The service role (ops cleanup, the
-- provider integration tests) is not a client and may delete.
create or replace function public.guard_league_tournament_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return old;
  end if;
  if not exists (select 1 from public.leagues where id = old.league_id) then
    return old;
  end if;
  if public.picks_are_locked(old.league_id, old.tournament_id) then
    raise exception 'tournament locked'
      using errcode = 'P0001', detail = 'tournament_locked';
  end if;
  if exists (
    select 1 from public.brackets
     where league_id = old.league_id and tournament_id = old.tournament_id
  ) then
    raise exception 'league tournament has brackets'
      using errcode = 'P0001', detail = 'brackets_exist';
  end if;
  return old;
end;
$$;

drop trigger if exists league_tournaments_delete_guard on public.league_tournaments;
create trigger league_tournaments_delete_guard
  before delete on public.league_tournaments
  for each row execute function public.guard_league_tournament_delete();

revoke all on function public.tournament_schedulable(uuid, uuid) from public;
revoke all on function public.assert_schedule_editable(uuid) from public;
revoke all on function public.add_league_tournament(uuid, uuid) from public;
revoke all on function public.remove_league_tournament(uuid, uuid) from public;
revoke all on function public.enable_custom_schedule(uuid) from public;
revoke all on function public.league_schedule_candidates(uuid) from public;
revoke all on function public.guard_league_tournament_delete() from public;

grant execute on function public.add_league_tournament(uuid, uuid) to authenticated;
grant execute on function public.remove_league_tournament(uuid, uuid) to authenticated;
grant execute on function public.enable_custom_schedule(uuid) to authenticated;
grant execute on function public.league_schedule_candidates(uuid) to authenticated;
