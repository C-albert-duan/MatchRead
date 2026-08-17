-- 0015_solo_league_slug_uuid.sql
-- Fix ensure_solo_league slug entropy: gen_random_bytes is not on search_path
-- (public-only) on Supabase. Use gen_random_uuid instead.
-- Idempotent: redefines the same RPC as 0013.

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
    v_suffix := substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);
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
