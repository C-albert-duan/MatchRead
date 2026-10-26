-- A season league covers every tournament (apps/web leagueIncludesTournament),
-- but create_league adds no league_tournaments rows for it. brackets
-- references league_tournaments, so a member's first save in a season league
-- failed with brackets_league_id_tournament_id_fkey and Submit showed that
-- raw message. Solo and single leagues worked because their one row exists.
--
-- save_picks now adds the schedule row on a season league's first save.
-- A single league still refuses a tournament it does not include, with a
-- readable error instead of the foreign key violation.

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
    select format into v_format from public.leagues where id = p_league_id;
    if v_format is distinct from 'season' then
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
