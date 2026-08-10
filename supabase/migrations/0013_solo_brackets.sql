-- 0013_solo_brackets.sql
-- Solo brackets: implicit private single-tournament league of one (is_solo).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Column + uniqueness
-- ---------------------------------------------------------------------------

alter table public.leagues
  add column if not exists is_solo boolean not null default false;

create unique index if not exists leagues_solo_commissioner_tournament_uidx
  on public.leagues (commissioner_id, tournament_label)
  where is_solo and format = 'single' and tournament_label is not null;

-- ---------------------------------------------------------------------------
-- ensure_solo_league: find or create personal league for a tournament ref
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
    and l.tournament_label = v_t.name
  limit 1;

  if v_league.id is not null then
    league_id := v_league.id;
    league_slug := v_league.slug;
    tournament_ref := v_t.ref;
    return next;
    return;
  end if;

  v_base := lower(trim(v_t.name));
  v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
  v_base := regexp_replace(v_base, '^-+|-+$', '', 'g');
  v_base := left(coalesce(nullif(v_base, ''), 'solo'), 48);

  loop
    v_attempt := v_attempt + 1;
    v_suffix := substr(encode(gen_random_bytes(3), 'hex'), 1, 4);
    v_slug := v_base || '-' || v_suffix;

    begin
      insert into public.leagues as l (
        slug,
        name,
        format,
        visibility,
        tournament_label,
        commissioner_id,
        is_solo
      )
      values (
        v_slug,
        v_t.name,
        'single',
        'private',
        v_t.name,
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
        -- retry slug collision or race on solo unique index
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
-- join_league_with_token: graduate solo → social when a second member joins
-- ---------------------------------------------------------------------------

create or replace function public.join_league_with_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid;
  v_revoked timestamptz;
  v_member_count int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select i.league_id, i.revoked_at
    into v_league_id, v_revoked
  from public.league_invites i
  where i.token = p_token;

  if v_league_id is null then
    raise exception 'invalid invite';
  end if;

  if v_revoked is not null then
    raise exception 'invite revoked';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league_id, auth.uid(), 'member')
  on conflict (league_id, user_id) do nothing;

  select count(*)::int into v_member_count
  from public.league_members m
  where m.league_id = v_league_id;

  if v_member_count >= 2 then
    update public.leagues
    set is_solo = false
    where id = v_league_id
      and is_solo = true;
  end if;

  return v_league_id;
end;
$$;

revoke all on function public.join_league_with_token(text) from public;
grant execute on function public.join_league_with_token(text) to authenticated;
