-- 0026_league_tournament_id.sql
-- Single-event leagues bind to one tournament row (ATP vs WTA are distinct).
-- tournament_label stays the display name. Idempotent.

alter table public.leagues
  add column if not exists tournament_id uuid references public.tournaments (id) on delete restrict;

comment on column public.leagues.tournament_id is
  'Single-event league: the one tournament this league is for. Null on season leagues.';

create index if not exists leagues_tournament_id_idx
  on public.leagues (tournament_id)
  where tournament_id is not null;

-- Unique name → one row.
update public.leagues l
   set tournament_id = t.id
  from public.tournaments t
 where l.format = 'single'
   and l.tournament_id is null
   and l.tournament_label is not null
   and t.name = l.tournament_label
   and (
     select count(*)::int
       from public.tournaments t2
      where t2.name = l.tournament_label
   ) = 1;

-- Shared name (Cincinnati ATP + WTA): use an existing bracket if it is unique.
update public.leagues l
   set tournament_id = x.tournament_id
  from (
    select b.league_id, (array_agg(b.tournament_id))[1] as tournament_id
      from public.brackets b
      join public.leagues lx on lx.id = b.league_id
      join public.tournaments t on t.id = b.tournament_id
     where lx.format = 'single'
       and lx.tournament_id is null
       and lx.tournament_label = t.name
     group by b.league_id
    having count(distinct b.tournament_id) = 1
  ) x
 where l.id = x.league_id
   and l.tournament_id is null;

-- Else snapshots.
update public.leagues l
   set tournament_id = x.tournament_id
  from (
    select s.league_id, (array_agg(s.tournament_id))[1] as tournament_id
      from public.bracket_snapshots s
      join public.leagues lx on lx.id = s.league_id
      join public.tournaments t on t.id = s.tournament_id
     where lx.format = 'single'
       and lx.tournament_id is null
       and lx.tournament_label = t.name
     group by s.league_id
    having count(distinct s.tournament_id) = 1
  ) x
 where l.id = x.league_id
   and l.tournament_id is null;

-- Else league name mentions WTA or ATP.
update public.leagues l
   set tournament_id = t.id
  from public.tournaments t
 where l.format = 'single'
   and l.tournament_id is null
   and l.tournament_label = t.name
   and (
     (l.name ~* '(^|[^a-z])wta([^a-z]|$)' and t.tour = 'wta')
     or (l.name ~* '(^|[^a-z])atp([^a-z]|$)' and t.tour = 'atp')
   );

drop index if exists public.leagues_solo_commissioner_tournament_uidx;

create unique index if not exists leagues_solo_commissioner_tournament_id_uidx
  on public.leagues (commissioner_id, tournament_id)
  where is_solo and format = 'single' and tournament_id is not null;

-- ---------------------------------------------------------------------------
-- Resolve create_league input: ref first, then unique name.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_tournament_for_league(p_input text)
returns public.tournaments
language plpgsql
stable
set search_path = public
as $$
declare
  v_t public.tournaments;
  v_n int;
begin
  if p_input is null or length(trim(p_input)) = 0 then
    raise exception 'Pick a tournament.';
  end if;

  select * into v_t
    from public.tournaments
   where ref = trim(p_input);

  if v_t.id is not null then
    return v_t;
  end if;

  select count(*)::int into v_n
    from public.tournaments
   where name = trim(p_input);

  if v_n = 0 then
    raise exception 'Pick a tournament.';
  end if;

  if v_n > 1 then
    raise exception 'That event has ATP and WTA draws. Pick one tour.';
  end if;

  select * into v_t
    from public.tournaments
   where name = trim(p_input);

  return v_t;
end;
$$;

revoke all on function public.resolve_tournament_for_league(text) from public;
grant execute on function public.resolve_tournament_for_league(text) to authenticated;

create or replace function public.create_league(
  p_name text,
  p_slug text,
  p_format text,
  p_visibility text,
  p_tournament_label text
)
returns table (league_id uuid, league_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_league_id uuid;
  v_t public.tournaments;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Give your league a name.';
  end if;

  if p_format not in ('single', 'season') then
    raise exception 'Choose a format.';
  end if;

  if p_visibility not in ('private', 'public') then
    raise exception 'Choose who can see it.';
  end if;

  if p_format = 'single' then
    v_t := public.resolve_tournament_for_league(p_tournament_label);
  end if;

  insert into public.profiles (id)
  values (v_uid)
  on conflict (id) do nothing;

  insert into public.leagues as l (
    slug,
    name,
    format,
    visibility,
    tournament_label,
    tournament_id,
    commissioner_id
  )
  values (
    p_slug,
    trim(p_name),
    p_format,
    p_visibility,
    case when p_format = 'single' then v_t.name else null end,
    case when p_format = 'single' then v_t.id else null end,
    v_uid
  )
  returning l.id into v_league_id;

  insert into public.league_members (league_id, user_id, role)
  values (v_league_id, v_uid, 'commissioner');

  insert into public.league_invites (league_id, created_by)
  values (v_league_id, v_uid);

  league_id := v_league_id;
  league_slug := p_slug;
  return next;
end;
$$;

revoke all on function public.create_league(text, text, text, text, text) from public;
grant execute on function public.create_league(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Solo: one personal league per (user, tournament id)
-- ---------------------------------------------------------------------------

drop function if exists public.ensure_solo_league(text);

create or replace function public.ensure_solo_league(p_tournament_ref text)
returns table (
  league_id uuid,
  league_slug text,
  tournament_ref text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_t public.tournaments;
  v_league public.leagues;
  v_slug text;
  v_base text;
  v_suffix text;
  v_attempt int := 0;
  v_name_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_tournament_ref is null or length(trim(p_tournament_ref)) = 0 then
    raise exception 'tournament not found';
  end if;

  select * into v_t
    from public.tournaments t
   where t.ref = trim(p_tournament_ref);

  if v_t.id is null then
    raise exception 'tournament not found';
  end if;

  insert into public.profiles (id)
  values (v_uid)
  on conflict (id) do nothing;

  select * into v_league
    from public.leagues l
   where l.is_solo
     and l.format = 'single'
     and l.commissioner_id = v_uid
     and l.tournament_id = v_t.id
   limit 1;

  if v_league.id is null then
    select count(*)::int into v_name_count
      from public.tournaments
     where name = v_t.name;

    if v_name_count = 1 then
      select * into v_league
        from public.leagues l
       where l.is_solo
         and l.format = 'single'
         and l.commissioner_id = v_uid
         and l.tournament_id is null
         and l.tournament_label = v_t.name
       limit 1;

      if v_league.id is not null then
        update public.leagues
           set tournament_id = v_t.id
         where id = v_league.id;
      end if;
    end if;
  end if;

  if v_league.id is not null then
    league_id := v_league.id;
    league_slug := v_league.slug;
    tournament_ref := v_t.ref;
    return next;
    return;
  end if;

  v_base := lower(trim(v_t.tour || '-' || v_t.name));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '^-+|-+$', '', 'g');
  v_base := left(coalesce(nullif(v_base, ''), 'solo'), 48);

  loop
    v_attempt := v_attempt + 1;
    v_suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
    v_slug := v_base || '-' || v_suffix;

    begin
      insert into public.leagues as l (
        slug,
        name,
        format,
        visibility,
        tournament_label,
        tournament_id,
        commissioner_id,
        is_solo
      )
      values (
        v_slug,
        v_t.name,
        'single',
        'private',
        v_t.name,
        v_t.id,
        v_uid,
        true
      )
      returning * into v_league;

      exit;
    exception
      when unique_violation then
        if v_attempt >= 8 then
          raise;
        end if;
    end;
  end loop;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_uid, 'commissioner');

  insert into public.league_invites (league_id, created_by)
  values (v_league.id, v_uid);

  league_id := v_league.id;
  league_slug := v_league.slug;
  tournament_ref := v_t.ref;
  return next;
end;
$$;

revoke all on function public.ensure_solo_league(text) from public;
grant execute on function public.ensure_solo_league(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Commissioner lock: season or this tournament id
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
       or l.tournament_id = v_t.id
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

-- ---------------------------------------------------------------------------
-- RLS: commissioner writes only for their tournament (or any, if season)
-- ---------------------------------------------------------------------------

drop policy if exists match_results_commissioner_write on public.match_results;
create policy match_results_commissioner_write on public.match_results
  for all using (
    exists (
      select 1
      from public.leagues l
      join public.league_members m on m.league_id = l.id
      where m.user_id = auth.uid()
        and m.role = 'commissioner'
        and (
          l.format = 'season'
          or l.tournament_id = match_results.tournament_id
        )
    )
  )
  with check (
    exists (
      select 1
      from public.leagues l
      join public.league_members m on m.league_id = l.id
      where m.user_id = auth.uid()
        and m.role = 'commissioner'
        and (
          l.format = 'season'
          or l.tournament_id = match_results.tournament_id
        )
    )
  );

drop policy if exists pick_voids_commissioner on public.pick_voids;
create policy pick_voids_commissioner on public.pick_voids
  for insert with check (
    exists (
      select 1
      from public.leagues l
      join public.league_members m on m.league_id = l.id
      where m.user_id = auth.uid()
        and m.role = 'commissioner'
        and (
          l.format = 'season'
          or l.tournament_id = pick_voids.tournament_id
        )
    )
  );
