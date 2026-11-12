-- 0049_validate_picks_and_remove_guard.sql
--
-- Fix list P1-3 and P1-7 (check/CODEBASE-FIX-LIST.md).
--
-- P1-3. save_picks stored any match id and any player id. A member could pad
-- a bracket with match ids from another tournament and pass submit_bracket,
-- which only counted pick rows. Now:
--   * save_picks refuses a match outside the tournament, and a player who
--     cannot reach that match: not seated in the match's seat range and not a
--     side of a round-1 match inside it (the announced draw, before seats).
--   * submit_bracket counts only picks on this tournament's matches.
--
-- P1-7. remove_league_tournament did not check the league's schedule mode.
-- On a league that counts every tournament it "removed" a row the next save
-- re-added. It now refuses exactly as add_league_tournament does.
--
-- Bodies are 0046 (save_picks, remove_league_tournament) and 0006
-- (submit_bracket) with only the marked additions.

-- ---------------------------------------------------------------------------
-- P1-3: can this player be picked to win this match?
-- ---------------------------------------------------------------------------
create or replace function public.pick_player_reaches_match(
  p_tournament_id uuid,
  p_round int,
  p_index int,
  p_player_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Match (round r, index i) is fed by seats [i * 2^(r+1), (i+1) * 2^(r+1))
  -- and by round-1 matches [i * 2^r, (i+1) * 2^r).
  select exists (
    select 1 from public.seats s
     where s.tournament_id = p_tournament_id
       and s.kind = 'player'
       and s.player_id = p_player_id
       and s.position >= p_index * (1 << (p_round + 1))
       and s.position < (p_index + 1) * (1 << (p_round + 1))
  ) or exists (
    select 1 from public.matches m
     where m.tournament_id = p_tournament_id
       and m.round = 0
       and m.index_in_round >= p_index * (1 << p_round)
       and m.index_in_round < (p_index + 1) * (1 << p_round)
       and p_player_id in (m.side_a_player_id, m.side_b_player_id)
  );
$$;

revoke all on function public.pick_player_reaches_match(uuid, int, int, uuid)
  from public, anon, authenticated;
grant execute on function public.pick_player_reaches_match(uuid, int, int, uuid)
  to service_role;

-- ---------------------------------------------------------------------------
-- P1-3: save_picks
-- ---------------------------------------------------------------------------
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
  v_round int;
  v_index int;
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

    -- 0049: the match must belong to this tournament ...
    select m.round, m.index_in_round into v_round, v_index
      from public.matches m
     where m.id = v_match_id and m.tournament_id = p_tournament_id;
    if not found then
      raise exception 'invalid pick'
        using errcode = 'P0001', detail = 'pick_match_not_in_tournament';
    end if;
    -- ... and the player must be able to reach it.
    if v_player_id is null
       or not public.pick_player_reaches_match(p_tournament_id, v_round, v_index, v_player_id) then
      raise exception 'invalid pick'
        using errcode = 'P0001', detail = 'pick_player_not_in_match';
    end if;

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

-- ---------------------------------------------------------------------------
-- P1-3: submit_bracket counts only this tournament's picks
-- ---------------------------------------------------------------------------
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
  v_bracket public.brackets;
  v_need int;
  v_have int;
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

  select * into v_bracket
    from public.brackets
   where league_id = p_league_id
     and tournament_id = p_tournament_id
     and user_id = auth.uid();

  if v_bracket.id is null then
    raise exception 'No bracket to submit';
  end if;

  select t.draw_size - 1 into v_need
    from public.tournaments t
   where t.id = p_tournament_id;

  if v_need is null or v_need < 1 then
    raise exception 'Draw size unknown';
  end if;

  -- 0049: only picks on this tournament's matches count.
  select count(*) into v_have
    from public.picks p
    join public.matches m on m.id = p.match_id
   where p.bracket_id = v_bracket.id
     and m.tournament_id = p_tournament_id;
  if v_have < v_need then
    raise exception 'Incomplete bracket';
  end if;

  update public.brackets
     set submitted_at = coalesce(submitted_at, now()),
         updated_at = now()
   where id = v_bracket.id
  returning * into v_bracket;

  return v_bracket;
end;
$$;

-- ---------------------------------------------------------------------------
-- P1-7: Remove only on custom season leagues
-- ---------------------------------------------------------------------------
create or replace function public.remove_league_tournament(p_league_id uuid, p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues;
  v_count int;
begin
  v_league := public.assert_schedule_editable(p_league_id);

  -- 0049: same refusals, same order, as add_league_tournament.
  if v_league.format <> 'season' then
    raise exception 'single tournament league'
      using errcode = 'P0001', detail = 'single_tournament_league';
  end if;
  if v_league.schedule_mode <> 'custom' then
    raise exception 'schedule not custom'
      using errcode = 'P0001', detail = 'schedule_not_custom';
  end if;

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
  'Commissioner only, custom season leagues. Refuses when locked, when brackets exist, or for the last event. Absent returns not_on_schedule.';
