-- remove_league_tournament was a plain delete. brackets reference
-- league_tournaments on delete cascade, so one call erased every member's
-- bracket and picks for that event, settled points included.
-- Same signature, same grants. Refuse instead of cascading:
--   * the caller must be the commissioner         (42501)
--   * picks must not be locked for this league    (P0001 tournament_locked)
--   * no member may have a bracket for the event  (P0001 brackets_exist)
--   * the league keeps at least one tournament    (P0001 last_tournament)
-- Removing an event that is not on the schedule is a no-op (retry is safe).
-- The league row is locked first, so two sessions cannot both pass the
-- last-tournament check.

create or replace function public.remove_league_tournament(p_league_id uuid, p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'Not commissioner'
      using errcode = '42501', detail = 'unauthorized';
  end if;

  perform 1 from public.leagues where id = p_league_id for update;

  if not exists (
    select 1 from public.league_tournaments
     where league_id = p_league_id and tournament_id = p_tournament_id
  ) then
    return;
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
end;
$$;

comment on function public.remove_league_tournament(uuid, uuid) is
  'Commissioner only. Refuses when locked, when brackets exist, or for the last event. No-op when absent.';
