-- Fix: season-league commissioners could see "Lock draw now" in the UI
-- (membership.role = commissioner) but admin_lock_tournament only allowed
-- commissioners of single leagues (tournament_label = tournament.name).
-- Season leagues store tournament_label as null, so the RPC always failed.
-- Idempotent: same final RPC as 0003; safe to re-run alone or after 0001–0006.

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
    -- Prefer the league the commissioner is acting from (matches the UI).
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
    -- Legacy fallback: any commissioner of a single league tied to this event,
    -- or any season-league commissioner.
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
