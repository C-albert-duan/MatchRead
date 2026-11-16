-- 0051_rpc_error_detail_codes.sql
--
-- Fix list P2-9 (check/CODEBASE-FIX-LIST.md). The web actions matched these
-- functions' errors by their English wording and passed the raw text to
-- users in every language. Each raise now carries a stable DETAIL code the
-- actions map to translated copy. Messages are unchanged, so a web build
-- that still matches on wording keeps working during the rollout.
--
-- Generated: each body is the function's latest definition, with only
-- "using detail = '<code>'" added to each plain raise.

-- ensure_solo_league: body from 0011_solo_league_display_name.sql
create or replace function public.ensure_solo_league(p_tournament_id uuid)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.leagues;
  v_t public.tournaments;
  v_display text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using detail = 'not_authenticated';
  end if;

  perform public.ensure_profile(null);

  select nullif(trim(p.display_name), '')
    into v_display
    from public.profiles p
   where p.id = auth.uid();

  select t.* into v_t from public.tournaments t where t.id = p_tournament_id;
  if v_t.id is null then
    raise exception 'Tournament not found' using detail = 'tournament_not_found';
  end if;

  v_name := coalesce(v_t.name, 'Solo')
    || case
         when v_display is not null then ' · ' || v_display
         else ' · You'
       end;

  select l.* into v_existing
    from public.leagues l
    join public.league_tournaments lt on lt.league_id = l.id
   where l.owner_id = auth.uid()
     and l.is_solo = true
     and l.format = 'single'
     and lt.tournament_id = p_tournament_id
   limit 1;

  if v_existing.id is not null then
    if v_existing.name is distinct from v_name then
      update public.leagues
         set name = v_name
       where id = v_existing.id
      returning * into v_existing;
    end if;
    return v_existing;
  end if;

  return public.create_league(
    p_name := v_name,
    p_format := 'single',
    p_tournament_id := p_tournament_id,
    p_visibility := 'private',
    p_is_solo := true
  );
end;
$$;

-- create_league: body from 0006_rls_and_rpcs.sql
create or replace function public.create_league(
  p_name text,
  p_format text,
  p_tournament_id uuid default null,
  p_visibility text default 'private',
  p_is_solo boolean default false
)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.leagues;
  v_slug text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using detail = 'not_authenticated';
  end if;

  perform public.ensure_profile(null);

  if p_format not in ('single', 'season') then
    raise exception 'invalid format' using detail = 'invalid_format';
  end if;
  if p_format = 'single' and p_tournament_id is null then
    raise exception 'single league requires tournament_id' using detail = 'tournament_required';
  end if;
  if p_format = 'season' and p_tournament_id is not null then
    raise exception 'season league: add tournaments via league_tournaments' using detail = 'season_no_tournament';
  end if;

  v_slug := lower(regexp_replace(trim(p_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  if v_slug is null or v_slug = '' then
    v_slug := 'league';
  end if;
  v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  insert into public.leagues (owner_id, slug, name, format, visibility, is_solo)
  values (
    auth.uid(),
    v_slug,
    nullif(trim(p_name), ''),
    p_format,
    coalesce(nullif(p_visibility, ''), 'private'),
    coalesce(p_is_solo, false)
  )
  returning * into v_league;

  insert into public.members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'commissioner');

  if p_tournament_id is not null then
    insert into public.league_tournaments (league_id, tournament_id)
    values (v_league.id, p_tournament_id);
  end if;

  insert into public.invites (league_id, token, created_by)
  values (v_league.id, encode(extensions.gen_random_bytes(16), 'hex'), auth.uid());

  return v_league;
end;
$$;

-- update_league: body from 0006_rls_and_rpcs.sql
create or replace function public.update_league(
  p_league_id uuid,
  p_name text default null,
  p_visibility text default null
)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.leagues;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner' using detail = 'not_commissioner';
  end if;

  update public.leagues
     set name = coalesce(nullif(trim(p_name), ''), name),
         visibility = coalesce(nullif(p_visibility, ''), visibility)
   where id = p_league_id
  returning * into v_row;

  return v_row;
end;
$$;

-- delete_league: body from 0006_rls_and_rpcs.sql
create or replace function public.delete_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner' using detail = 'not_commissioner';
  end if;
  delete from public.leagues where id = p_league_id;
end;
$$;

-- join_with_invite: body from 0006_rls_and_rpcs.sql
create or replace function public.join_with_invite(p_token text)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites;
  v_league public.leagues;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using detail = 'not_authenticated';
  end if;

  perform public.ensure_profile(null);

  select * into v_invite
    from public.invites
   where token = p_token and revoked_at is null
   limit 1;

  if v_invite.id is null then
    raise exception 'Invalid invite' using detail = 'invalid_invite';
  end if;

  select * into v_league from public.leagues where id = v_invite.league_id;

  insert into public.members (league_id, user_id, role)
  values (v_league.id, auth.uid(), 'member')
  on conflict (league_id, user_id) do nothing;

  if v_league.is_solo then
    update public.leagues set is_solo = false where id = v_league.id;
    v_league.is_solo := false;
  end if;

  return v_league;
end;
$$;

-- reissue_invite: body from 0008_member_invite_rpcs.sql
create or replace function public.reissue_invite(p_league_id uuid)
returns public.invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.invites;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner' using detail = 'not_commissioner';
  end if;

  update public.invites
     set revoked_at = now()
   where league_id = p_league_id
     and revoked_at is null;

  insert into public.invites (league_id, token, created_by)
  values (p_league_id, encode(extensions.gen_random_bytes(16), 'hex'), auth.uid())
  returning * into v_row;

  return v_row;
end;
$$;

-- kick_league_member: body from 0008_member_invite_rpcs.sql
create or replace function public.kick_league_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner' using detail = 'not_commissioner';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot kick self' using detail = 'cannot_kick_self';
  end if;
  if exists (
    select 1 from public.leagues where id = p_league_id and owner_id = p_user_id
  ) then
    raise exception 'cannot kick commissioner' using detail = 'cannot_kick_commissioner';
  end if;
  delete from public.members
   where league_id = p_league_id and user_id = p_user_id;
  if not found then
    raise exception 'member not found' using detail = 'member_not_found';
  end if;
end;
$$;

-- leave_league: body from 0008_member_invite_rpcs.sql
create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using detail = 'not_authenticated';
  end if;
  if exists (
    select 1 from public.leagues where id = p_league_id and owner_id = auth.uid()
  ) then
    raise exception 'commissioner cannot leave' using detail = 'commissioner_cannot_leave';
  end if;
  delete from public.members
   where league_id = p_league_id and user_id = auth.uid();
  if not found then
    raise exception 'not a member' using detail = 'not_a_member';
  end if;
end;
$$;

-- lock_league_event: body from 0006_rls_and_rpcs.sql
create or replace function public.lock_league_event(p_league_id uuid, p_tournament_id uuid)
returns public.league_tournaments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.league_tournaments;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner' using detail = 'not_commissioner';
  end if;

  update public.league_tournaments
     set locked_at = coalesce(locked_at, now()),
         locked_by = auth.uid()
   where league_id = p_league_id
     and tournament_id = p_tournament_id
  returning * into v_row;

  if v_row.league_id is null then
    raise exception 'League does not include this tournament' using detail = 'tournament_not_in_league';
  end if;

  return v_row;
end;
$$;

-- save_picks: body from 0049_validate_picks_and_remove_guard.sql
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
    raise exception 'Not authenticated' using detail = 'not_authenticated';
  end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member' using detail = 'not_a_member';
  end if;
  if public.picks_are_locked(p_league_id, p_tournament_id) then
    raise exception 'tournament locked' using detail = 'tournament_locked';
  end if;

  if not exists (
    select 1 from public.league_tournaments
     where league_id = p_league_id and tournament_id = p_tournament_id
  ) then
    select format, schedule_mode into v_format, v_mode
      from public.leagues where id = p_league_id;
    if v_format is distinct from 'season' or v_mode = 'custom' then
      raise exception 'League does not include this tournament' using detail = 'tournament_not_in_league';
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
    raise exception 'tournament locked' using detail = 'tournament_locked';
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

-- submit_bracket: body from 0049_validate_picks_and_remove_guard.sql
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
    raise exception 'Not authenticated' using detail = 'not_authenticated';
  end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'Not a member' using detail = 'not_a_member';
  end if;
  if public.picks_are_locked(p_league_id, p_tournament_id) then
    raise exception 'tournament locked' using detail = 'tournament_locked';
  end if;

  select * into v_bracket
    from public.brackets
   where league_id = p_league_id
     and tournament_id = p_tournament_id
     and user_id = auth.uid();

  if v_bracket.id is null then
    raise exception 'No bracket to submit' using detail = 'no_bracket';
  end if;

  select t.draw_size - 1 into v_need
    from public.tournaments t
   where t.id = p_tournament_id;

  if v_need is null or v_need < 1 then
    raise exception 'Draw size unknown' using detail = 'draw_size_unknown';
  end if;

  -- 0049: only picks on this tournament's matches count.
  select count(*) into v_have
    from public.picks p
    join public.matches m on m.id = p.match_id
   where p.bracket_id = v_bracket.id
     and m.tournament_id = p_tournament_id;
  if v_have < v_need then
    raise exception 'Incomplete bracket' using detail = 'incomplete_bracket';
  end if;

  update public.brackets
     set submitted_at = coalesce(submitted_at, now()),
         updated_at = now()
   where id = v_bracket.id
  returning * into v_bracket;

  return v_bracket;
end;
$$;
