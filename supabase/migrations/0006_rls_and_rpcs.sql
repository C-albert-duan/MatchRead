-- 0006_rls_and_rpcs.sql
-- Product RPCs + lock helpers. No seed data.

-- League mates may read each other's display names.
drop policy if exists profiles_select_league_mates on public.profiles;
create policy profiles_select_league_mates on public.profiles
  for select using (
    auth.uid() = id
    or exists (
      select 1
      from public.members me
      join public.members them on them.league_id = me.league_id
      where me.user_id = auth.uid()
        and them.user_id = profiles.id
    )
  );

create or replace function public.ensure_profile(p_display_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_display_name), '');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), v_name)
  on conflict (id) do update
    set display_name = coalesce(v_name, public.profiles.display_name);
end;
$$;

create or replace function public.set_my_display_name(p_name text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_row public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_name := nullif(trim(p_name), '');
  if v_name is null then
    raise exception 'Display name is required';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 32 then
    raise exception 'Display name must be 2–32 characters';
  end if;

  insert into public.profiles (id, display_name)
  values (auth.uid(), v_name)
  on conflict (id) do update
    set display_name = excluded.display_name
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.picks_are_locked(p_league_id uuid, p_tournament_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.league_tournaments lt
       where lt.league_id = p_league_id
         and lt.tournament_id = p_tournament_id
         and lt.locked_at is not null
    )
    or exists (
      select 1 from public.tournaments t
       where t.id = p_tournament_id
         and t.lock_at is not null
         and t.lock_at <= now()
         and public.draw_is_official(t.id)
    );
$$;

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
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_profile(null);

  if p_format not in ('single', 'season') then
    raise exception 'invalid format';
  end if;
  if p_format = 'single' and p_tournament_id is null then
    raise exception 'single league requires tournament_id';
  end if;
  if p_format = 'season' and p_tournament_id is not null then
    raise exception 'season league: add tournaments via league_tournaments';
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

create or replace function public.add_league_tournament(p_league_id uuid, p_tournament_id uuid)
returns public.league_tournaments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.league_tournaments;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner';
  end if;

  insert into public.league_tournaments (league_id, tournament_id)
  values (p_league_id, p_tournament_id)
  on conflict (league_id, tournament_id) do nothing
  returning * into v_row;

  if v_row.league_id is null then
    select * into v_row from public.league_tournaments
     where league_id = p_league_id and tournament_id = p_tournament_id;
  end if;

  return v_row;
end;
$$;

create or replace function public.remove_league_tournament(p_league_id uuid, p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner';
  end if;
  delete from public.league_tournaments
   where league_id = p_league_id and tournament_id = p_tournament_id;
end;
$$;

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
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_profile(null);

  select * into v_invite
    from public.invites
   where token = p_token and revoked_at is null
   limit 1;

  if v_invite.id is null then
    raise exception 'Invalid invite';
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

create or replace function public.ensure_solo_league(p_tournament_id uuid)
returns public.leagues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.leagues;
  v_t public.tournaments;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_profile(null);

  select t.* into v_t from public.tournaments t where t.id = p_tournament_id;
  if v_t.id is null then
    raise exception 'Tournament not found';
  end if;

  select l.* into v_existing
    from public.leagues l
    join public.league_tournaments lt on lt.league_id = l.id
   where l.owner_id = auth.uid()
     and l.is_solo = true
     and l.format = 'single'
     and lt.tournament_id = p_tournament_id
   limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  return public.create_league(
    p_name := coalesce(v_t.name, 'Solo') || ' (solo)',
    p_format := 'single',
    p_tournament_id := p_tournament_id,
    p_visibility := 'private',
    p_is_solo := true
  );
end;
$$;

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
    raise exception 'Not commissioner';
  end if;

  update public.league_tournaments
     set locked_at = coalesce(locked_at, now()),
         locked_by = auth.uid()
   where league_id = p_league_id
     and tournament_id = p_tournament_id
  returning * into v_row;

  if v_row.league_id is null then
    raise exception 'League does not include this tournament';
  end if;

  return v_row;
end;
$$;

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

  select count(*) into v_have from public.picks where bracket_id = v_bracket.id;
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
    raise exception 'Not commissioner';
  end if;

  update public.leagues
     set name = coalesce(nullif(trim(p_name), ''), name),
         visibility = coalesce(nullif(p_visibility, ''), visibility)
   where id = p_league_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner';
  end if;
  delete from public.leagues where id = p_league_id;
end;
$$;

revoke all on function public.ensure_profile(text) from public;
revoke all on function public.set_my_display_name(text) from public;
revoke all on function public.picks_are_locked(uuid, uuid) from public;
revoke all on function public.create_league(text, text, uuid, text, boolean) from public;
revoke all on function public.add_league_tournament(uuid, uuid) from public;
revoke all on function public.remove_league_tournament(uuid, uuid) from public;
revoke all on function public.join_with_invite(text) from public;
revoke all on function public.ensure_solo_league(uuid) from public;
revoke all on function public.lock_league_event(uuid, uuid) from public;
revoke all on function public.save_picks(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.submit_bracket(uuid, uuid) from public;
revoke all on function public.update_league(uuid, text, text) from public;
revoke all on function public.delete_league(uuid) from public;

grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.set_my_display_name(text) to authenticated;
grant execute on function public.picks_are_locked(uuid, uuid) to authenticated;
grant execute on function public.create_league(text, text, uuid, text, boolean) to authenticated;
grant execute on function public.add_league_tournament(uuid, uuid) to authenticated;
grant execute on function public.remove_league_tournament(uuid, uuid) to authenticated;
grant execute on function public.join_with_invite(text) to authenticated;
grant execute on function public.ensure_solo_league(uuid) to authenticated;
grant execute on function public.lock_league_event(uuid, uuid) to authenticated;
grant execute on function public.save_picks(uuid, uuid, jsonb, jsonb) to authenticated;
grant execute on function public.submit_bracket(uuid, uuid) to authenticated;
grant execute on function public.update_league(uuid, text, text) to authenticated;
grant execute on function public.delete_league(uuid) to authenticated;
