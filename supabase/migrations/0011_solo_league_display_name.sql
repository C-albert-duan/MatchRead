-- 0011_solo_league_display_name.sql
-- Solo league titles include the owner's display name for easy recognition.

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
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_profile(null);

  select nullif(trim(p.display_name), '')
    into v_display
    from public.profiles p
   where p.id = auth.uid();

  select t.* into v_t from public.tournaments t where t.id = p_tournament_id;
  if v_t.id is null then
    raise exception 'Tournament not found';
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

comment on function public.ensure_solo_league(uuid) is
  'Find or create a private solo league; name is "{tournament} · {display_name}".';
